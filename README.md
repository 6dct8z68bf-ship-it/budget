# Family Weekly Budget Tracker Web App

A small family budget web app with three operational layers:

- local Docker development for day-to-day product work
- Docker image build plus isolated VM E2E validation in GitHub Actions
- OCI infrastructure managed with Terraform

## Repo layout

- `deploy/`: Dockerfile and compose files for local, E2E, and production runtime
- `data/budget-store.example.json`: repo-safe starter data file
- `tests/e2e/post-deploy.spec.js`: Playwright smoke and regression checks
- `infra-bootstrap/`: one-time Terraform stack that creates the OCI Object Storage bucket for Terraform state
- `infra/`: main OCI Terraform stack for networking, VM, NLB, and cloud-init

The local internal Traditional Chinese rebuild and developer runbook is kept in `internal-documentation/system-build-guide.zh-TW.md`. The `internal-documentation/` folder is intentionally local-only and ignored by git.

## Frontend stack (Vite + Svelte 5 + TypeScript)

The client is a Svelte 5 + TypeScript app bundled by Vite. The backend remains a
dependency-free Node server (`src/server/server.js`).

- `src/client/`: Svelte app (components, stores, chart/import modules, i18n)
- `src/shared/budget-data.json`: category config + credit limit + seed/example state,
  read by both the client and the server (`/api/reset`)
- `src/client/styles.css`: global design system imported by the Svelte client
- `src/client/public/`: Vite public assets such as favicon and Landing page images
- `dist/public/`: Vite build output served in production

### Local development

Requires Node `>=20.19` (Node 22 recommended — see `.nvmrc`; matches the Docker image).

```bash
npm install          # install client build/dev dependencies
npm run dev:all      # Vite dev server (http://localhost:5174) + Node API (:5173)
```

The Vite dev server proxies `/api` and `/auth` to the Node server so the `HttpOnly`
`SameSite=Lax` session cookie stays same-origin. Open the app at
`http://localhost:5174/` (landing) and `http://localhost:5174/app` (app).

Other scripts:

```bash
npm run typecheck    # tsc --noEmit + svelte-check
npm run build        # vite build → dist/public
npm run preview      # Node server serving the built dist/public on :5173
npm run test:e2e     # Playwright suite (see tests/e2e/post-deploy.spec.js)
```

`window.__budgetDebug` exposes a small, deliberate read-only diagnostics surface used by
the Playwright suite (chart internals, current state) — it is not used by the app itself.

## Local Docker development

Run locally:

```powershell
docker compose -f deploy/docker-compose.yml -p family-budget up --build
```

Run in the background:

```powershell
docker compose -f deploy/docker-compose.yml -p family-budget up -d --build
```

Stop:

```powershell
docker compose -f deploy/docker-compose.yml -p family-budget down
```

Local URL:

```text
http://127.0.0.1:5173/
```

Notes:

- local runtime uses `deploy/docker-compose.yml`
- local runtime is HTTP only, on port `5173`
- local `workspace-stores/` is bind-mounted into `/app/workspace-stores` for all workspace-owned data files, including the default workspace
- the default workspace now lives at `workspace-stores/default/budget-store.json`

### JSON storage safety

Runtime registries and workspace state use guarded JSON writes. Each write is
prepared in a temporary sibling file and then replaced into place; the previous
valid file is retained as `<file>.bak`. If a JSON file is truncated or malformed
on startup, the server attempts to recover it from that backup before serving
the data. Only one backup is retained per JSON file, so backups do not grow
without limit. The backup files are runtime artifacts and should be included when
backing up `workspace-stores/`.

`POST /api/state` also rejects payloads without a valid `currentMonthId` and
month collection, so a malformed client request cannot replace a workspace
with an unusable state. This is still file-backed storage: the backup/recovery
guard protects interrupted writes, but it is not a substitute for database
transactions or multi-process optimistic locking.

Writes to the same file are serialized within one Node process. The health
endpoint reports the current queue depth, active writes, recovery count, and
write failures without exposing storage paths or file contents. Running multiple
server processes still requires a database or an external locking strategy.

### Password hash helper

Generate an account password hash locally with:

```powershell
npm.cmd run hash-password -- "your-password-here"
```

The output is a `scrypt$<salt>$<key>` value suitable for the `DEFAULT_ACCOUNT_PASSWORD_HASH` GitHub Actions secret. Treat this hash as sensitive authentication material. Do not commit it to the repo or paste it into logs.

## Docker image build and E2E validation

The published app image is built from:

```text
deploy/Dockerfile
```

### `docker-image.yml`

This workflow:

- builds the Docker image on pushes to `main`, pull requests to `main`, and manual dispatch
- ignores `infra/**` changes
- pushes `latest` and `sha-<commit>` tags for non-PR builds
- pushes `pr-<head-sha>` tags for same-repo pull requests
- runs an isolated VM-hosted E2E deployment after a successful build when:
  - pushing to `main`
  - manually dispatching the workflow
  - opening a same-repo pull request

### E2E deployment model

The automated E2E deployment uses:

```text
deploy/docker-compose.e2e.yml
${VM_APP_PATH}/e2e-<github.run_id>-<suite>
project name: family-budget-e2e
VM localhost only: 127.0.0.1:18080 and 127.0.0.1:18443
GitHub Actions access: SSH tunnel to https://127.0.0.1:18443/
```

The workflow:

- creates an isolated app directory on the VM
- copies `deploy/docker-compose.e2e.yml`
- copies `data/budget-store.example.json` as runtime `workspace-stores/default/budget-store.json`
- generates a short-lived localhost TLS certificate on the VM
- generates a random app password
- pulls the just-built immutable image tag
- runs each feature suite as a separate GitHub Actions matrix job so a flaky suite can be rerun on its own
- keeps E2E suites serialized with `max-parallel: 1` because the current VM compose file uses fixed localhost ports
- runs Playwright through an SSH tunnel with a suite tag, for example:

```powershell
npm install
npx playwright install --with-deps chromium
npm run test:e2e -- --project=chromium --grep "@e2e-import"
```

Current suites are `@e2e-core`, `@e2e-auth`, `@e2e-workspace-account`, `@e2e-import`, and `@e2e-charts-ui`. If an E2E suite fails, the workflow prints the container logs and then cleans up that suite's isolated deployment.

## Production VM deployment

Production deployment uses:

```text
deploy/docker-compose.prod.yml
```

This compose file:

- pulls `docker.io/henryhhl18/family-budget-app:${APP_IMAGE_TAG:-latest}`
- exposes `80:5173` and `443:5443`
- redirects HTTP to HTTPS
- mounts runtime certs from `./certs`
- mounts all workspace data from `./workspace-stores`

### `deploy-vm.yml`

This workflow runs:

- automatically after a successful `Docker Image CI` workflow run on `main`
- manually with `workflow_dispatch`

The workflow:

- writes `APP_SSL_CERT` and `APP_SSL_KEY` secrets into temporary files
- copies the cert files to `${VM_APP_PATH}/certs`
- copies `deploy/docker-compose.prod.yml` to `${VM_APP_PATH}/docker-compose.yml`
- writes `.env` values on the VM for:
  - `APP_IMAGE_TAG`
  - `APP_PASSWORD`
  - `SESSION_SECRET`
  - `DEFAULT_ACCOUNT_PASSWORD_HASH`
  - `APP_BUILD_VERSION`
  - `APP_BUILD_TIME`
- ensures `${VM_APP_PATH}/workspace-stores` exists for workspace-owned budget files
- migrates any legacy root `budget-store.json` into `workspace-stores/default/budget-store.json`
- pulls the selected image and starts the compose project `family-budget`

Automatic deploys use the immutable `sha-<commit>` image tag from the upstream build workflow. Manual runs fall back to `latest`.

Production authentication checks the account registry password hash first. If the default account does not yet have a valid `scrypt$<salt>$<key>` `passwordHash`, the server bootstraps it from `DEFAULT_ACCOUNT_PASSWORD_HASH`. `APP_PASSWORD` remains as a fallback during the current development phase so a bad hash secret does not lock out the owner/admin account.

Google OAuth is the normal new-user onboarding path. A verified Google login automatically creates a trial account with its own clean workspace; the default owner can review users in Settings and promote approved trial users to standard access. Password accounts remain available for owner/admin or internal recovery use, not normal public trial onboarding.

## Terraform infrastructure

Terraform is intentionally split in two parts.

### `infra-bootstrap/`

Purpose:

- create the OCI Object Storage bucket used for Terraform remote state

State model:

- local state only

Typical use:

```powershell
cd infra-bootstrap
terraform init -reconfigure
terraform plan
terraform apply
```

This stack is low-frequency and mainly exists to bootstrap the remote state bucket.

### `infra/`

Purpose:

- manage the OCI VCN, subnets, security lists, VM, NLB, and cloud-init

State model:

- OCI remote backend via `backend "oci" {}`
- local machine uses a local `backend.hcl` file that is intentionally ignored by git

Typical use after a machine move or backend change:

```powershell
cd infra
terraform init -reconfigure -backend-config="backend.hcl"
terraform plan
```

Helpful notes:

- `cloud-init.yaml` installs Docker on first boot
- `REMOTE_STATE_MIGRATION.md` documents the original local-to-OCI state migration flow
- local `terraform.tfvars` and `backend.hcl` are machine-specific and should stay out of git

### Terraform GitHub Actions

`terraform-infra.yml` runs when `infra/**` changes on PRs or pushes to `main`, and can also be run manually.

It:

- writes OCI credentials to `~/.oci/oci_api_key.pem`
- generates `infra/backend.hcl` inside CI
- runs `terraform init -backend-config=backend.hcl -reconfigure`
- runs `terraform plan`
- uploads the plan artifact
- runs `terraform apply` on `main`

## GitHub Actions configuration

### Secrets used by image / E2E / deploy workflows

```text
DOCKERHUB_TOKEN
VM_SSH_PRIVATE_KEY
VM_SSH_KNOWN_HOSTS
APP_PASSWORD
SESSION_SECRET
DEFAULT_ACCOUNT_PASSWORD_HASH
GOOGLE_OAUTH_CLIENT_SECRET
APP_SSL_CERT
APP_SSL_KEY
```

`SESSION_SECRET` is a secret, not a variable. It is used to HMAC session tokens before they are written to the durable session registry. If it is not set, the app falls back to plain SHA-256 token hashing so existing development deployments keep working, but production should set it.

Generate `SESSION_SECRET` as a long random value, for example `openssl rand -hex 32`, and store it as a GitHub Actions secret.

`DEFAULT_ACCOUNT_PASSWORD_HASH` is a secret, not a variable. It should contain the `scrypt$<salt>$<key>` output from `npm.cmd run hash-password`. Keep `APP_PASSWORD` during the transition; it remains the fallback password if the account hash is missing or invalid.

`GOOGLE_OAUTH_CLIENT_SECRET` is a secret, not a variable. It is used by the Google OAuth server-side authorization-code flow. The app does not expose this value through health checks, diagnostics, or frontend JavaScript. Google OAuth remains disabled unless `GOOGLE_OAUTH_ENABLED=true` and the required client configuration is also present.

### Variables used by image / E2E / deploy workflows

```text
DOCKERHUB_USERNAME
VM_SSH_HOST
VM_SSH_USER
VM_APP_PATH
VM_DOMAIN
GOOGLE_OAUTH_ENABLED
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_APP_BASE_URL
GOOGLE_OAUTH_REDIRECT_PATH
GOOGLE_OAUTH_ALLOWED_DOMAIN
```

Google OAuth supports open trial signup. When enabled, a visitor can use a verified Google account to create or reopen a trial account and a clean account-owned workspace. Password login remains available for existing password accounts.

- `GOOGLE_OAUTH_CLIENT_ID`: Google OAuth web client ID.
- `GOOGLE_OAUTH_APP_BASE_URL`: public app origin, for example `https://money.example.com`.
- `GOOGLE_OAUTH_REDIRECT_PATH`: callback path, default `/auth/google/callback`.
- `GOOGLE_OAUTH_ALLOWED_DOMAIN`: optional Google Workspace hosted-domain restriction.

The full redirect URI registered in Google Cloud Console should be `${GOOGLE_OAUTH_APP_BASE_URL}${GOOGLE_OAUTH_REDIRECT_PATH}`.

Google OAuth uses only the `openid email profile` scopes and stores the Google `sub`, verified email, and display name in the account registry. Google access tokens are not stored. Automatically created Google accounts are marked with `accountStatus: "trial"` so trial limits can be introduced later without changing the sign-in model.

For production OAuth callbacks, the server validates the Google ID token signature using the Google JWKS endpoint, then checks issuer, audience, expiry, nonce, and the userinfo subject. `GOOGLE_OAUTH_JWKS_ENDPOINT` can override the default key endpoint for controlled test environments.

Password login is rate-limited in memory by client address. The defaults are 10 failed attempts per 15 minutes; `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` and `LOGIN_RATE_LIMIT_WINDOW_MS` can adjust the values for a controlled deployment. HTTPS deployments automatically mark the session cookie `Secure`; `SECURE_SESSION_COOKIE=true` can enable it explicitly.

### Secrets used by Terraform workflow

```text
OCI_PRIVATE_KEY
OCI_TENANCY_OCID
OCI_USER_OCID
OCI_FINGERPRINT
TF_VAR_COMPARTMENT_OCID
TF_VAR_IMAGE_OCID
VM_SSH_PUBLIC_KEY
```

### Terraform workflow environment defaults

The workflow currently sets these defaults internally:

```text
TF_VAR_region=ap-sydney-1
TF_VAR_availability_domain=AD-1
TF_VAR_instance_shape=VM.Standard.E2.1.Micro
```

## Quick operational summary

- product work: local Docker on `http://127.0.0.1:5173/`
- image publishing: `docker-image.yml`
- isolated VM validation: feature-based `e2e` matrix jobs in `docker-image.yml`
- production deployment: `deploy-vm.yml`
- state bucket bootstrap: `infra-bootstrap/`
- main OCI infrastructure: `infra/`
