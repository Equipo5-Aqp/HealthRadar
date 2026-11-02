# VM de recuperación: solo existe con crear_vm = true. Replica la VM del portal (ADR-011):
# B2als_v2, Ubuntu 24.04, 30 GiB StandardSSD, IP estática, NSG con 22 y 3000, apagado 02:00.
# Al primer arranque, cloud-init ejecuta bootstrap_vm.sh, que restaura el último backup.

resource "azurerm_virtual_network" "dr" {
  count               = var.crear_vm ? 1 : 0
  name                = "${var.prefix}-dr-vnet"
  resource_group_name = azurerm_resource_group.dr.name
  location            = azurerm_resource_group.dr.location
  address_space       = ["10.20.0.0/16"]
  tags                = local.tags
}

resource "azurerm_subnet" "dr" {
  count                = var.crear_vm ? 1 : 0
  name                 = "${var.prefix}-dr-subnet"
  resource_group_name  = azurerm_resource_group.dr.name
  virtual_network_name = azurerm_virtual_network.dr[0].name
  address_prefixes     = ["10.20.1.0/24"]
}

# ADR-008/ADR-011: solo 22 (SSH con llave) y 3000 (nginx-shell). PostgreSQL, n8n y Phoenix no salen.
resource "azurerm_network_security_group" "dr" {
  count               = var.crear_vm ? 1 : 0
  name                = "${var.prefix}-dr-nsg"
  resource_group_name = azurerm_resource_group.dr.name
  location            = azurerm_resource_group.dr.location
  tags                = local.tags

  security_rule {
    name                       = "Allow-SSH-22"
    priority                   = 1000
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = var.ssh_source_cidr
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "Allow-Frontend-3000"
    priority                   = 1010
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "3000"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

resource "azurerm_public_ip" "dr" {
  count               = var.crear_vm ? 1 : 0
  name                = "${var.prefix}-dr-ip"
  resource_group_name = azurerm_resource_group.dr.name
  location            = azurerm_resource_group.dr.location
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.tags
}

resource "azurerm_network_interface" "dr" {
  count               = var.crear_vm ? 1 : 0
  name                = "${var.prefix}-dr-nic"
  resource_group_name = azurerm_resource_group.dr.name
  location            = azurerm_resource_group.dr.location
  tags                = local.tags

  ip_configuration {
    name                          = "ipconfig1"
    subnet_id                     = azurerm_subnet.dr[0].id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.dr[0].id
  }
}

resource "azurerm_network_interface_security_group_association" "dr" {
  count                     = var.crear_vm ? 1 : 0
  network_interface_id      = azurerm_network_interface.dr[0].id
  network_security_group_id = azurerm_network_security_group.dr[0].id
}

resource "azurerm_linux_virtual_machine" "dr" {
  count                           = var.crear_vm ? 1 : 0
  name                            = "${var.prefix}-vm-dr"
  resource_group_name             = azurerm_resource_group.dr.name
  location                        = azurerm_resource_group.dr.location
  size                            = var.vm_size
  admin_username                  = "azureuser"
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.dr[0].id]
  tags                            = local.tags

  admin_ssh_key {
    username   = "azureuser"
    public_key = file(pathexpand(var.ssh_public_key_path))
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "StandardSSD_LRS"
    disk_size_gb         = 30
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "ubuntu-24_04-lts"
    sku       = "server"
    version   = "latest"
  }

  # Identidad administrada: con ella la VM lee Key Vault y Blob sin guardar claves (rbac.tf).
  identity {
    type = "SystemAssigned"
  }

  custom_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
    repo_url          = var.repo_url
    repo_ref          = var.repo_ref
    key_vault_name    = azurerm_key_vault.secretos.name
    env_secret_name   = local.env_secret_name
    storage_account   = azurerm_storage_account.backups.name
    storage_container = azurerm_storage_container.backups.name
  }))

  lifecycle {
    # Cambiar repo_ref no debe recrear la VM en silencio: para reconstruirla a propósito
    # se usa `terraform apply -replace=azurerm_linux_virtual_machine.dr[0]`.
    ignore_changes = [custom_data]
  }
}

resource "azurerm_dev_test_global_vm_shutdown_schedule" "dr" {
  count                 = var.crear_vm ? 1 : 0
  virtual_machine_id    = azurerm_linux_virtual_machine.dr[0].id
  location              = azurerm_resource_group.dr.location
  enabled               = true
  daily_recurrence_time = var.auto_shutdown_hora
  timezone              = "SA Pacific Standard Time" # UTC-5 (Lima)
  tags                  = local.tags

  notification_settings {
    enabled = false
  }
}
