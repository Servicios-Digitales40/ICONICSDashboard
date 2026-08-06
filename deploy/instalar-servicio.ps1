<#
.SINOPSIS
    Registra el tablero como servicio de Windows con NSSM.

.DESCRIPCION
    Se ejecuta UNA VEZ en el servidor, como administrador. Después, desplegar
    una versión nueva es sólo `desplegar.ps1`: el servicio ya apunta a
    `current` y se reinicia solo.

    Qué resuelve, y por qué cada cosa:

      · Arranque automático tras un reinicio del equipo. Sin esto, un corte de
        luz de madrugada deja las pantallas apagadas hasta que alguien entra
        al servidor (P1-1 del Plan 3).
      · Reinicio si el proceso muere.
      · Rotación de logs. Node escribe una línea JSON por evento; sin techo,
        eso llena el disco del servidor y tumba algo más que el tablero (P1-4).
      · Cuenta de servicio dedicada, sin sesión interactiva.

    NSSM se descarga de https://nssm.cc y basta con dejar nssm.exe en el PATH
    o junto a este guion.

.PARAMETER Raiz
    Directorio de instalación. Por defecto D:\IconicsDashboard.

.PARAMETER Cuenta
    Cuenta de servicio, p. ej. ".\svc_dashboard" o "DOMINIO\svc_dashboard".
    Si se omite, el servicio corre como LocalSystem — cómodo para una prueba,
    desaconsejado en producción: LocalSystem tiene más permisos sobre la
    máquina de los que este proceso necesita jamás.

.EJEMPLO
    .\instalar-servicio.ps1 -Cuenta ".\svc_dashboard"
#>
#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$Raiz = "D:\IconicsDashboard",
  [string]$Servicio = "IconicsDashboard",
  [string]$Cuenta,
  [string]$Nssm = "nssm"
)

$ErrorActionPreference = "Stop"

function Bien($t) { Write-Host "  OK  " -ForegroundColor Green -NoNewline; Write-Host $t }
function Aviso($t) { Write-Host "  !!  " -ForegroundColor Yellow -NoNewline; Write-Host $t }

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Registrar un servicio necesita PowerShell como administrador."
}
if (-not (Get-Command $Nssm -ErrorAction SilentlyContinue)) {
  throw "No se encuentra nssm. Descárgalo de https://nssm.cc y ponlo en el PATH."
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "No se encuentra node en el PATH." }

$config = Join-Path $Raiz "config\.env.production"
$logs   = Join-Path $Raiz "logs"
$actual = Join-Path $Raiz "current"

foreach ($ruta in $actual, $config) {
  if (-not (Test-Path $ruta)) { throw "Falta $ruta. Despliega una release y crea el .env.production antes." }
}
New-Item -ItemType Directory -Force $logs | Out-Null

Write-Host "`nRegistrando el servicio '$Servicio'" -ForegroundColor White
Write-Host "node: $node" -ForegroundColor DarkGray

if (Get-Service $Servicio -ErrorAction SilentlyContinue) {
  Aviso "el servicio ya existe; se reconfigura"
  & $Nssm stop $Servicio confirm | Out-Null
} else {
  & $Nssm install $Servicio $node | Out-Null
}

# `--env-file` en los argumentos y no variables del servicio: así el secreto
# vive en un solo archivo con sus permisos, y no copiado dentro del registro
# de Windows donde nadie se acuerda de que está.
& $Nssm set $Servicio AppParameters "--env-file=`"$config`" backend\server.mjs" | Out-Null

# El directorio de trabajo es el JUNCTION, nunca una release concreta: es lo
# que hace que cambiar de versión sea rehacer el enlace y reiniciar.
& $Nssm set $Servicio AppDirectory $actual | Out-Null
& $Nssm set $Servicio DisplayName "ICONICS Dashboard" | Out-Null
& $Nssm set $Servicio Description "Tablero de OEE de planta (Resonac) sobre ICONICS" | Out-Null
& $Nssm set $Servicio Start SERVICE_AUTO_START | Out-Null

& $Nssm set $Servicio AppExit Default Restart | Out-Null
& $Nssm set $Servicio AppRestartDelay 5000 | Out-Null

& $Nssm set $Servicio AppStdout (Join-Path $logs "dashboard.log") | Out-Null
& $Nssm set $Servicio AppStderr (Join-Path $logs "dashboard.err.log") | Out-Null
& $Nssm set $Servicio AppRotateFiles 1 | Out-Null
& $Nssm set $Servicio AppRotateOnline 1 | Out-Null
& $Nssm set $Servicio AppRotateBytes 10485760 | Out-Null

if ($Cuenta) {
  $clave = Read-Host "Contraseña de $Cuenta" -AsSecureString
  $plano = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($clave))
  & $Nssm set $Servicio ObjectName $Cuenta $plano | Out-Null
  Bien "corriendo como $Cuenta"
} else {
  Aviso "sin -Cuenta: correrá como LocalSystem, que tiene más permisos de los necesarios"
}

Bien "configurado"

& $Nssm start $Servicio | Out-Null
Start-Sleep -Seconds 4

$estado = (Get-Service $Servicio).Status
if ($estado -ne "Running") {
  throw "El servicio quedó en estado '$estado'. Mira $logs\dashboard.err.log"
}
Bien "arrancado"

try {
  $salud = (Invoke-WebRequest "http://127.0.0.1:3001/api/health" -UseBasicParsing -TimeoutSec 10).Content | ConvertFrom-Json
  Bien "responde: estado $($salud.status), versión $($salud.version), solo lectura $($salud.readOnly)"
  if ($salud.readOnly -ne $true) {
    Aviso "ICONICS_READ_ONLY está en false: la escritura sobre la planta está HABILITADA"
  }
} catch {
  Aviso "el servicio corre pero /api/health no responde: $($_.Exception.Message)"
}

Write-Host "`nServicio '$Servicio' listo. Arrancará solo tras un reinicio del equipo." -ForegroundColor Green
Write-Host "Logs: $logs`n" -ForegroundColor DarkGray
