# OCI Remote State Migration

## 1. Create the state bucket

Bootstrap the bucket with the dedicated stack:

```powershell
cd infra-bootstrap
terraform init
terraform apply
```

Record these outputs:

- `bucket_name`
- `namespace`
- `region`
- `state_key`
- `workspace_key_prefix`

## 2. Prepare backend config for the main stack

In `infra`, create a local `backend.hcl` and fill in the values from bootstrap.

`backend.hcl` should look like:

```hcl
bucket               = "family-budget-tfstate"
namespace            = "your-oci-namespace"
region               = "ap-sydney-1"
key                  = "infra/terraform.tfstate"
workspace_key_prefix = "tf-state-env"
```

Keep credentials out of `backend.hcl`. Reuse your normal OCI provider auth via
environment variables or the existing provider configuration.

## 3. Migrate the current local state

From `infra`:

```powershell
terraform init -backend-config=backend.hcl -migrate-state
```

Terraform will prompt to copy the existing local `terraform.tfstate` into the
bucket.

## 4. Verify

After init completes:

```powershell
terraform state list
terraform plan
```

You can then keep the local `terraform.tfstate` files only as historical
backups, or remove them once you are comfortable the remote backend is working.
