variable "compartment_ocid" {
  description = "OCID of the OCI compartment that will own the Terraform state bucket"
  type        = string
}

variable "user_ocid" {
  description = "OCI user OCID for API key authentication"
  type        = string
}

variable "tenancy_ocid" {
  description = "OCI tenancy OCID for API key authentication"
  type        = string
}

variable "api_key_fingerprint" {
  description = "Fingerprint of the uploaded OCI API key"
  type        = string
}

variable "private_key_path" {
  description = "Path to the OCI API private key PEM file"
  type        = string
  default     = "~/.oci/oci_api_key.pem"
}

variable "region" {
  description = "OCI region where the Terraform state bucket will live"
  type        = string
  default     = "ap-sydney-1"
}

variable "bucket_name" {
  description = "Name of the Object Storage bucket for Terraform remote state"
  type        = string
  default     = "family-budget-tfstate"
}

variable "state_key" {
  description = "Object key used by the main infra stack for the default workspace state file"
  type        = string
  default     = "infra/terraform.tfstate"
}

variable "workspace_key_prefix" {
  description = "Prefix used by Terraform for non-default workspaces in the remote backend"
  type        = string
  default     = "tf-state-env"
}

variable "bucket_scope" {
  description = "Bucket naming scope. Valid OCI values are Namespace or REGION."
  type        = string
  default     = "REGION"
}
