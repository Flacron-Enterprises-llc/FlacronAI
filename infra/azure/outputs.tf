output "resource_group" {
  value = azurerm_resource_group.app.name
}

output "acr_login_server" {
  value = azurerm_container_registry.acr.login_server
}

output "acr_id" {
  value = azurerm_container_registry.acr.id
}

output "key_vault_name" {
  value = azurerm_key_vault.app.name
}

output "container_app_name" {
  value = try(azurerm_container_app.api[0].name, null)
}

output "container_app_id" {
  value = try(azurerm_container_app.api[0].id, null)
}

output "api_url" {
  value = try("https://${azurerm_container_app.api[0].ingress[0].fqdn}", null)
}

output "static_web_app_name" {
  value = azurerm_static_web_app.web.name
}

output "static_web_app_id" {
  value = azurerm_static_web_app.web.id
}

output "web_url" {
  value = "https://${azurerm_static_web_app.web.default_host_name}"
}

output "api_identity_principal_id" {
  value = azurerm_user_assigned_identity.api.principal_id
}

output "gh_deploy_client_id" {
  value = azuread_application.gh_deploy.client_id
}

output "gh_deploy_sp_object_id" {
  value = azuread_service_principal.gh_deploy.object_id
}
