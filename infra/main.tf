# ──────────────────────────────────────────────
# Networking
# ──────────────────────────────────────────────

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

locals {
  availability_domain_token = upper(trimspace(var.availability_domain))
  availability_domain_index = (
    can(regex("^AD-[1-9][0-9]*$", local.availability_domain_token))
    ? tonumber(replace(local.availability_domain_token, "AD-", "")) - 1
    : (
      can(regex("^[1-9][0-9]*$", local.availability_domain_token))
      ? tonumber(local.availability_domain_token) - 1
      : null
    )
  )
  availability_domain_name = (
    local.availability_domain_index != null
    ? data.oci_identity_availability_domains.ads.availability_domains[local.availability_domain_index].name
    : var.availability_domain
  )
  instance_user_data_base64 = trimspace(var.user_data_base64) != "" ? var.user_data_base64 : filebase64("${path.module}/cloud-init.yaml")
  nlb_services = {
    http = {
      backend_set_name = "http-backend-set"
      listener_name    = "http-listener"
      port             = 80
    }
    https = {
      backend_set_name = "https-backend-set"
      listener_name    = "https-listener"
      port             = 443
    }
    ssh = {
      backend_set_name = "ssh-backend-set"
      listener_name    = "ssh-listener"
      port             = 22
    }
  }
}

resource "oci_core_vcn" "main" {
  compartment_id = var.compartment_ocid
  display_name   = "${var.prefix}-vcn"
  cidr_blocks    = [var.vcn_cidr]
  dns_label      = "fbudgetvcn"
}

# ── Internet Gateway ──

resource "oci_core_internet_gateway" "main" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${var.prefix}-igw"
  enabled        = true
}

# ── Route Table ──

resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${var.prefix}-rt-public"

  route_rules {
    network_entity_id = oci_core_internet_gateway.main.id
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
  }
}

# ──────────────────────────────────────────────
# Subnet 1 — Public (NLB / general)
# ──────────────────────────────────────────────

resource "oci_core_subnet" "nlb" {
  compartment_id    = var.compartment_ocid
  vcn_id            = oci_core_vcn.main.id
  display_name      = "${var.prefix}-subnet-nlb"
  cidr_block        = var.subnet_nlb_cidr
  dns_label         = "nlb"
  route_table_id    = oci_core_route_table.public.id
  security_list_ids = [oci_core_security_list.nlb.id]
}

resource "oci_core_security_list" "nlb" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${var.prefix}-sl-nlb"

  ingress_security_rules {
    protocol    = "all"
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    description = "Allow all ingress from internet"
  }

  egress_security_rules {
    protocol         = "all"
    destination      = "0.0.0.0/0"
    destination_type = "CIDR_BLOCK"
    description      = "Allow all egress"
  }
}

# ──────────────────────────────────────────────
# Subnet 2 — VM
# ──────────────────────────────────────────────

resource "oci_core_subnet" "vm" {
  compartment_id    = var.compartment_ocid
  vcn_id            = oci_core_vcn.main.id
  display_name      = "${var.prefix}-subnet-vm"
  cidr_block        = var.subnet_vm_cidr
  dns_label         = "vm"
  route_table_id    = oci_core_route_table.public.id
  security_list_ids = [oci_core_security_list.vm.id]
}

resource "oci_core_security_list" "vm" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${var.prefix}-sl-vm"

  ingress_security_rules {
    protocol    = "6"
    source      = var.subnet_nlb_cidr
    source_type = "CIDR_BLOCK"
    description = "HTTP from NLB subnet"
    tcp_options {
      min = 80
      max = 80
    }
  }
  ingress_security_rules {
    protocol    = "6"
    source      = var.subnet_nlb_cidr
    source_type = "CIDR_BLOCK"
    description = "HTTPS from NLB subnet"
    tcp_options {
      min = 443
      max = 443
    }
  }
  ingress_security_rules {
    protocol    = "6"
    source      = var.subnet_nlb_cidr
    source_type = "CIDR_BLOCK"
    description = "SSH from NLB subnet"
    tcp_options {
      min = 22
      max = 22
    }
  }
  dynamic "ingress_security_rules" {
    for_each = var.admin_ssh_cidr != "" ? [var.admin_ssh_cidr] : []
    content {
      protocol    = "6"
      source      = ingress_security_rules.value
      source_type = "CIDR_BLOCK"
      description = "Temporary admin SSH for debugging"
      tcp_options {
        min = 22
        max = 22
      }
    }
  }
  egress_security_rules {
    protocol         = "all"
    destination      = "0.0.0.0/0"
    destination_type = "CIDR_BLOCK"
    description      = "Allow all egress"
  }
}

# ──────────────────────────────────────────────
# Compute — Ubuntu 24 VM
# ──────────────────────────────────────────────

resource "oci_core_instance" "app" {
  compartment_id      = var.compartment_ocid
  availability_domain = local.availability_domain_name
  display_name        = "${var.prefix}-vm"
  shape               = var.instance_shape

  source_details {
    source_type = "image"
    source_id   = var.image_ocid
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.vm.id
    display_name     = "${var.prefix}-vnic"
    assign_public_ip = true
  }

  metadata = merge(
    {
      ssh_authorized_keys = var.ssh_public_key != "" ? var.ssh_public_key : file(var.ssh_public_key_path)
      user_data           = local.instance_user_data_base64
    },
  )
}

resource "oci_network_load_balancer_network_load_balancer" "main" {
  compartment_id = var.compartment_ocid
  display_name   = "${var.prefix}-nlb"
  subnet_id      = oci_core_subnet.nlb.id
  is_private     = false
}

resource "oci_network_load_balancer_backend_set" "services" {
  for_each = local.nlb_services

  network_load_balancer_id = oci_network_load_balancer_network_load_balancer.main.id
  name                     = each.value.backend_set_name
  policy                   = "FIVE_TUPLE"
  is_preserve_source       = false

  health_checker {
    protocol           = "TCP"
    port               = each.value.port
    interval_in_millis = 10000
    timeout_in_millis  = 3000
    retries            = 3
  }
}

resource "oci_network_load_balancer_backend" "app" {
  for_each = local.nlb_services

  network_load_balancer_id = oci_network_load_balancer_network_load_balancer.main.id
  backend_set_name         = oci_network_load_balancer_backend_set.services[each.key].name
  ip_address               = oci_core_instance.app.private_ip
  port                     = each.value.port
  weight                   = 1
}

resource "oci_network_load_balancer_listener" "services" {
  for_each = local.nlb_services

  network_load_balancer_id = oci_network_load_balancer_network_load_balancer.main.id
  default_backend_set_name = oci_network_load_balancer_backend_set.services[each.key].name
  name                     = each.value.listener_name
  port                     = each.value.port
  protocol                 = "TCP"
}
