<#
.SYNOPSIS
  Abre en el Firewall de Windows los puertos del tablero, para que otros
  equipos de la red lo puedan ver. Requiere administrador. Se ejecuta UNA VEZ.

.DESCRIPTION
  Escuchar en 0.0.0.0 y estar accesible son dos cosas distintas, y la segunda
  no depende del programa. El backend ya escucha en todas las interfaces y el
  dev server de Vite tambien (`server.host` en vite.config.js), pero el
  Firewall de Windows descarta la conexion entrante antes de que Node la vea.
  El sintoma es el que desorienta: el ping contesta —ICMP tiene su propia
  regla, normalmente ya permitida— y aun asi el puerto parece cerrado. Por eso
  no sirve de nada seguir tocando la configuracion de la aplicacion.

  ── POR QUE LAS REGLAS SON DE PERFIL `Any` ────────────────────────────

  Windows mantiene un juego de reglas por perfil de red (Publico, Privado,
  Dominio) y aplica el del perfil de la conexion por la que entra el paquete.
  Una regla de perfil Privado sobre una red marcada como "Publica" no existe
  para esa red: el puerto sigue cerrado y el firewall no dice por que. Es la
  segunda trampa despues del ping, y la mas facil de dar por buena porque la
  regla aparece creada en la lista.

  Windows marca como Publica cualquier red que no reconozca, asi que la Wi-Fi
  de una planta o una oficina suele estarlo. La proteccion real de estas
  reglas no es el perfil sino la direccion remota: por defecto solo aceptan
  conexiones de equipos de la misma subred, nunca de fuera del router.

  ── CUANDO EL QUE MIRA ESTA EN OTRA SUBRED ────────────────────────────

  "Subred local" es lo que cabe en la mascara de esta maquina, y nada mas. Con
  10.10.17.14/24, un equipo en 10.10.21.11 NO es local: su trafico llega
  encaminado por el router y la regla lo rechaza igual que si viniera de
  internet. El sintoma vuelve a ser el de siempre —el puerto no responde— y la
  regla sigue apareciendo correcta en la lista, porque lo es: es su alcance el
  que no incluye a quien llama.

  Para eso esta `-Desde`: anade direcciones o rangos autorizados. La subred
  local se mantiene siempre, para no romper a quien ya entraba.

  ── LA REGLA QUE GANA A LAS DEMAS ─────────────────────────────────────

  La primera vez que Node abre un puerto, Windows pregunta si se permite. Si
  quien estaba delante pulso "Cancelar" —el reflejo razonable ante un aviso
  que no esperaba— Windows no se quedo callado: creo una regla que BLOQUEA
  node.exe en ese perfil, y ahi sigue.

  Eso importa porque en el Firewall de Windows un Bloquear vence a cualquier
  Permitir, sin importar cual sea mas especifico. Con esa regla puesta, abrir
  el puerto 5173 no cambia nada: el paquete encaja en las dos reglas y manda
  la que bloquea. Es la explicacion de por que "ya abri el puerto" no
  funciona, y no se ve en ninguna parte a menos que se busque.

  Por eso el script busca reglas de entrada que bloqueen node.exe y las
  DESACTIVA (no las borra: `-Quitar` las vuelve a activar).

  Esto NO pone autenticacion delante del tablero. Quien alcance el puerto
  entra, y el backend habla con ICONICS con una sesion privilegiada: es
  aceptable en una red de planta o de laboratorio, y no lo es en una Wi-Fi
  compartida con desconocidos. Con ICONICS_READ_ONLY sin poner (el defecto),
  al menos nadie puede escribir en la planta.

.PARAMETER Desde
  Direcciones o rangos, ademas de la subred local, que pueden alcanzar los
  puertos. Hace falta cuando quien mira esta en otra subred. Se admite una IP
  suelta (10.10.21.11), un rango en CIDR (10.10.0.0/16) o un intervalo
  (10.10.21.1-10.10.21.50).

  Se prefiere la IP concreta al rango: es la diferencia entre "puede entrar ese
  equipo" y "puede entrar cualquiera de esa red", y aqui no hay contrasena que
  respalde la segunda.

.PARAMETER Quitar
  Elimina las reglas en vez de crearlas, para dejar la maquina como estaba.

.EXAMPLE
  # Boton derecho sobre PowerShell -> Ejecutar como administrador
  .\scripts\exponer-en-red.ps1

.EXAMPLE
  # Un equipo de otra subred, y de paso los de la propia:
  .\scripts\exponer-en-red.ps1 -Desde 10.10.21.11

.EXAMPLE
  # Varios, o una red entera si de verdad hace falta:
  .\scripts\exponer-en-red.ps1 -Desde 10.10.21.11, 10.10.19.0/24

.EXAMPLE
  # Si responde "la ejecucion de scripts esta deshabilitada en este sistema":
  # Windows PowerShell 5.1 viene en Restricted de fabrica, y su politica es
  # independiente de la de PowerShell 7 (Get-ExecutionPolicy en pwsh puede
  # decir RemoteSigned y el 5.1 seguir negandose). El Bypass afecta solo a
  # esta llamada, que es preferible a relajar la politica de la maquina.
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\exponer-en-red.ps1

.EXAMPLE
  .\scripts\exponer-en-red.ps1 -Quitar
#>
[CmdletBinding()]
param(
  [string[]]$Desde = @(),
  [switch]$Quitar
)

$ErrorActionPreference = 'Stop'

# `LocalSubnet` va siempre. Si `-Desde` la sustituyera, autorizar a un equipo
# de otra subred desconectaria a los de la propia, que es lo contrario de lo
# que pide quien pasa el parametro.
$REMOTOS = @('LocalSubnet') + ($Desde | Where-Object { $_ -and $_.Trim() } | ForEach-Object { $_.Trim() })

# Los puertos, con nombre: el numero suelto en un mensaje de error no dice a
# quien pertenece, y aqui hay tres cosas escuchando.
$PUERTOS = @(
  @{ Puerto = 3001; Nombre = 'ICONICS Dashboard - backend (3001)'; Que = 'API + build de planta' }
  @{ Puerto = 5173; Nombre = 'ICONICS Dashboard - Vite dev (5173)'; Que = 'dev server con recarga en caliente' }
  @{ Puerto = 4173; Nombre = 'ICONICS Dashboard - Vite preview (4173)'; Que = 'preview del build compilado' }
)

$esAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent() `
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $esAdmin) {
  throw 'Hacen falta permisos de administrador. Abre PowerShell con "Ejecutar como administrador" y repite.'
}

# Reglas de entrada que bloquean node.exe, vengan del nombre que vengan. Se
# buscan por el programa y no por el nombre ("Node.js JavaScript Runtime")
# porque el nombre depende del idioma y de la version del instalador.
function Get-BloqueosDeNode {
  Get-NetFirewallRule -Direction Inbound -Action Block -ErrorAction SilentlyContinue |
    Where-Object {
      $programa = ($_ | Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue).Program
      $programa -and $programa -like '*\node.exe'
    }
}

if ($Quitar) {
  foreach ($p in $PUERTOS) {
    try {
      Remove-NetFirewallRule -DisplayName $p.Nombre -ErrorAction Stop
      Write-Host "  quitada    $($p.Nombre)" -ForegroundColor DarkGray
    } catch {
      Write-Host "  no existia $($p.Nombre)" -ForegroundColor DarkGray
    }
  }

  # Se reactiva lo que se desactivo, para dejar el firewall como estaba y no
  # como a nosotros nos convenia.
  # `Enabled` es un enum, no un booleano: se compara como texto para no
  # depender de como PowerShell convierta $true a ese tipo.
  $bloqueos = Get-BloqueosDeNode | Where-Object { "$($_.Enabled)" -eq 'False' }
  foreach ($b in $bloqueos) {
    Set-NetFirewallRule -Name $b.Name -Enabled True
    Write-Host "  reactivado el bloqueo de node.exe en perfil $($b.Profile)" -ForegroundColor DarkGray
  }

  Write-Host ''
  Write-Host '  Reglas eliminadas. El tablero vuelve a ser accesible solo desde esta maquina.' -ForegroundColor Cyan
  Write-Host ''
  return
}

# ── Primero el bloqueo, porque vence a todo lo que se cree despues ────
$bloqueos = @(Get-BloqueosDeNode | Where-Object { "$($_.Enabled)" -eq 'True' })
foreach ($b in $bloqueos) {
  Set-NetFirewallRule -Name $b.Name -Enabled False
  Write-Host "  desactivado  bloqueo de node.exe en perfil $($b.Profile)" -ForegroundColor Yellow
}
if ($bloqueos.Count -gt 0) {
  Write-Host '               (era lo que dejaba el puerto cerrado; -Quitar lo devuelve)' -ForegroundColor DarkGray
}

foreach ($p in $PUERTOS) {
  # Idempotente: se borra la regla anterior antes de crearla. Sin esto, cada
  # ejecucion deja un duplicado y acabas sin saber cual esta activa.
  try { Remove-NetFirewallRule -DisplayName $p.Nombre -ErrorAction Stop } catch {}

  # Sin `-Program`: atar la regla al node.exe de hoy la vuelve invisible el
  # dia que se instale otra version (nvm, un MSI nuevo) y el fallo no se
  # distingue de "el firewall no esta abierto". El limite util es la subred.
  New-NetFirewallRule `
    -DisplayName $p.Nombre `
    -Description "ICONICS Dashboard: $($p.Que)" `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $p.Puerto `
    -Profile Any `
    -RemoteAddress $REMOTOS | Out-Null

  Write-Host "  abierto  $($p.Puerto)   $($p.Que)" -ForegroundColor Green
}

Write-Host "  desde    $($REMOTOS -join ', ')" -ForegroundColor DarkGray

# ── Las URLs que hay que repartir ─────────────────────────────────────
# Se descartan las de enlace local (169.254.x): no llevan a ninguna parte y
# solo hacen ruido en la lista.
$ips = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
  Sort-Object InterfaceAlias

Write-Host ''
Write-Host '  Direcciones de esta maquina:' -ForegroundColor Cyan
foreach ($ip in $ips) {
  $perfil = (Get-NetConnectionProfile -InterfaceIndex $ip.InterfaceIndex -ErrorAction SilentlyContinue).NetworkCategory
  $etiqueta = if ($perfil) { "$($ip.InterfaceAlias), perfil $perfil" } else { $ip.InterfaceAlias }
  Write-Host ("    http://{0}:5173   ({1})" -f $ip.IPAddress, $etiqueta) -ForegroundColor Gray
}
Write-Host ''
Write-Host '  Reparte la de la interfaz que comparte subred con quien va a mirar.' -ForegroundColor DarkGray
Write-Host '  Una VPN activa (NordVPN, Radmin) puede desviar el trafico de vuelta y' -ForegroundColor DarkGray
Write-Host '  hacer que la conexion no complete aunque el firewall este abierto.' -ForegroundColor DarkGray
Write-Host ''
