data "oci_objectstorage_namespace" "current" {
  compartment_id = var.compartment_ocid
}

resource "oci_objectstorage_bucket" "tfstate" {
  compartment_id = var.compartment_ocid
  namespace      = data.oci_objectstorage_namespace.current.namespace
  name           = var.bucket_name
  bucket_scope   = var.bucket_scope
  storage_tier   = "Standard"
  versioning     = "Enabled"
}
