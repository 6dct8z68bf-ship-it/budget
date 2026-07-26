# Terraform State Bootstrap

This stack exists only to create the OCI Object Storage bucket used by the main
`infra/` stack for remote Terraform state.

## Files

- `provider.tf`: OCI provider setup for bootstrap
- `main.tf`: Creates the Object Storage bucket with versioning enabled
- `outputs.tf`: Prints the values needed for `infra/backend.hcl`
- `terraform.tfvars`: Local-only values file, kept out of git

## Usage

```powershell
cd infra-bootstrap
terraform init
terraform apply
```

Notes:

- The default bucket scope is `REGION`, which is the OCI API enum spelling.
- Bucket versioning is enabled for safer state recovery.

After apply, switch to `infra/` and follow
[`REMOTE_STATE_MIGRATION.md`](C:/Users/user/Documents/family%20weekly%20budget%20project/infra/REMOTE_STATE_MIGRATION.md).
