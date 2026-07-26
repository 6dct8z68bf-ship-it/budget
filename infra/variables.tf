variable "compartment_ocid" {
  description = "OCID of the OCI compartment to deploy into"
  type        = string
}

variable "user_ocid" {
  description = "Your OCI user OCID (from User Settings page)"
  type        = string
}

variable "tenancy_ocid" {
  description = "Your OCI tenancy OCID (from Tenancy details page)"
  type        = string
}

variable "api_key_fingerprint" {
  description = "Fingerprint of the OCI API key you uploaded (e.g. 12:34:56:78:90:ab:cd:ef:12:34:56:78:90:ab:cd:ef)"
  type        = string
}

variable "private_key_path" {
  description = "Path to your OCI API private key PEM file"
  type        = string
  default     = "~/.oci/oci_api_key.pem"
}

variable "region" {
  description = "OCI region (e.g. ap-sydney-1, ap-melbourne-1)"
  type        = string
  default     = "ap-sydney-1"
}

variable "availability_domain" {
  description = "Availability domain selector for the VM. Accepts OCI AD name, or shorthand like 1 / AD-1."
  type        = string
}

variable "prefix" {
  description = "Resource name prefix"
  type        = string
  default     = "family-budget"
}

# ── Networking ──

variable "vcn_cidr" {
  description = "VCN CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "subnet_nlb_cidr" {
  description = "CIDR for the NLB (public) subnet"
  type        = string
  default     = "10.0.1.0/24"
}

variable "subnet_vm_cidr" {
  description = "CIDR for the VM (private) subnet"
  type        = string
  default     = "10.0.2.0/24"
}

# ── Compute ──

variable "instance_shape" {
  description = "OCI instance shape (e.g. VM.Standard.E4.Flex, VM.Standard.A1.Flex)"
  type        = string
  default     = "VM.Standard.E4.Flex"
}

variable "image_ocid" {
  description = "Ubuntu 24.04 image OCID for the target region (e.g. ocid1.image.oc1.ap-sydney-1.xxxxx)"
  type        = string
}

variable "ssh_public_key" {
  description = "SSH public key content string (for GHA / non-file usage). If set, takes precedence over ssh_public_key_path."
  type        = string
  default     = ""
}

variable "ssh_public_key_path" {
  description = "Path to the SSH public key file for VM access (absolute path, no ~). Only used when ssh_public_key is empty."
  type        = string
  default     = "C:/Users/user/.ssh/id_rsa.pub"
}

variable "user_data_base64" {
  description = "Optional base64-encoded cloud-init override. Leave empty to use the bundled infra/cloud-init.yaml."
  type        = string
  default     = ""
}

variable "admin_ssh_cidr" {
  description = "Temporary admin CIDR allowed to SSH directly to the VM for debugging (e.g. 203.0.113.4/32). Leave empty to disable."
  type        = string
  default     = ""
}
