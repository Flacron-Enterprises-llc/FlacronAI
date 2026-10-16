output "project_id" {
  value = ibm_code_engine_project.app.project_id
}

output "project_name" {
  value = ibm_code_engine_project.app.name
}

output "icr_namespace" {
  value = ibm_cr_namespace.app.name
}

output "api_url" {
  value = try(ibm_code_engine_app.api[0].endpoint, null)
}

output "web_url" {
  value = try(ibm_code_engine_app.web[0].endpoint, null)
}
