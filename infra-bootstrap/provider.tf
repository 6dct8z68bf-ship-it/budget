terraform {
  required_version = ">= 1.5"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 8.20"
    }
  }
}

provider "oci" {
  region           = var.region
  user_ocid        = var.user_ocid
  tenancy_ocid     = var.tenancy_ocid
  fingerprint      = var.api_key_fingerprint
  private_key_path = var.private_key_path
}
