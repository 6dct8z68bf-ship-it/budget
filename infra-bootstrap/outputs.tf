output "bucket_name" {
  description = "Object Storage bucket name for Terraform remote state"
  value       = oci_objectstorage_bucket.tfstate.name
}

output "namespace" {
  description = "OCI Object Storage namespace used by the remote backend"
  value       = data.oci_objectstorage_namespace.current.namespace
}

output "region" {
  description = "OCI region for the remote backend"
  value       = var.region
}

output "state_key" {
  description = "Default workspace state object key for the main infra stack"
  value       = var.state_key
}

output "workspace_key_prefix" {
  description = "Workspace prefix to use in infra/backend.hcl"
  value       = var.workspace_key_prefix
}

output "backend_hcl_example" {
  description = "Copy these values into infra/backend.hcl before running terraform init -migrate-state"
  value       = <<-EOT
    bucket               = "${oci_objectstorage_bucket.tfstate.name}"
    namespace            = "${data.oci_objectstorage_namespace.current.namespace}"
    region               = "${var.region}"
    key                  = "${var.state_key}"
    workspace_key_prefix = "${var.workspace_key_prefix}"
  EOT
}
