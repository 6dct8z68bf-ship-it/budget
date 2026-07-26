output "vcn_id" {
  description = "OCID of the created VCN"
  value       = oci_core_vcn.main.id
}

output "subnet_nlb_id" {
  description = "OCID of the NLB (public) subnet"
  value       = oci_core_subnet.nlb.id
}

output "subnet_nlb_cidr" {
  description = "CIDR block of the NLB subnet (needed for security list reference)"
  value       = oci_core_subnet.nlb.cidr_block
}

output "subnet_vm_id" {
  description = "OCID of the VM (private) subnet"
  value       = oci_core_subnet.vm.id
}

output "instance_id" {
  description = "OCID of the created VM instance"
  value       = oci_core_instance.app.id
}

output "instance_private_ip" {
  description = "Private IP of the VM instance"
  value       = oci_core_instance.app.private_ip
}

output "nlb_id" {
  description = "OCID of the Network Load Balancer"
  value       = oci_network_load_balancer_network_load_balancer.main.id
}

output "nlb_ip_addresses" {
  description = "IP addresses assigned to the Network Load Balancer"
  value       = oci_network_load_balancer_network_load_balancer.main.ip_addresses
}
