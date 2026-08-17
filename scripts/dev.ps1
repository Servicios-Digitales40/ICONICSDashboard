<#
.SYNOPSIS
  Levanta el entorno de desarrollo completo: backend puente + dev server de Vite.

.DESCRIPTION
  Son dos procesos y no uno, y cada uno abre su propia ventana para que sus
  logs no se mezclen y Ctrl+C corte solo el que quieres cortar.

  ── LA PARTE QUE CONFUNDE: HAY QUE ABRIR :5173, NO :3001 ──────────────

  Los dos puertos sirven la aplicacion, pero NO la misma aplicacion:

    :3001  el backend sirve `react-dashboard/dist`, el build compilado. Es lo
           que corre en planta. Las 12 propuestas de diseno y «Planta · v2» NO
           estan ahi, porque VITE_ENABLE_PROTOTYPES es una bandera de
           COMPILACION: Vite la pliega a un literal y la rama entera
           desaparece del bundle. Ver react-dashboard/src/lib/flags.js.

    :5173  el dev server de Vite, que lee las banderas al arrancar. Aqui si
           salen los prototipos, y ademas hay recarga en caliente.

  El backend sigue haciendo falta con :5173: es quien habla con ICONICS. El
  dev server le reenvia /api (`server.proxy` en vite.config.js), asi que para
  el navegador todo cuelga del mismo origen y no hay CORS que configurar.

  ── DESDE OTRO EQUIPO DE LA RED ───────────────────────────────────────

  Los dos procesos escuchan en todas las interfaces, asi que basta abrir
  http://<ip-de-esta-maquina>:5173 . Si no responde y el ping si, es el
  Firewall de Windows: scripts/exponer-en-red.ps1, como administrador.

.PARAMETER SinPrototipos
  Arranca Vite sin las banderas de superficie, para ver la aplicacion tal y
  como la vera la planta pero con recarga en caliente.

.EXAMPLE
  .\scripts\dev.ps1

.EXAMPLE
  # Si responde "la ejecucion de scripts esta deshabilitada en este sistema":
  # Windows PowerShell 5.1 viene en Restricted de fabrica, y su politica es
  # independiente de la de PowerShell 7. El Bypass afecta solo a esta llamada.
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1
#>
[CmdletBinding()]
param(
  [switch]$SinPrototipos
)

$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $raiz '.env.local'
$frontend = Join-Path $raiz 'react-dashboard'

if (-not (Test-Path $envFile)) {
  throw "No existe $envFile. Copia .env.example y rellena las credenciales de ICONICS."
}
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
  throw "Faltan las dependencias del frontend. Ejecuta: cd react-dashboard; npm install"
}


# pwsh si esta; si no, Windows PowerShell. El script funciona en ambos.
$shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }

function Start-Ventana([string]$titulo, [string]$directorio, [string]$comando) {
  $script = "`$Host.UI.RawUI.WindowTitle = '$titulo'; Set-Location '$directorio'; $comando"
  Start-Process $shell -ArgumentList '-NoExit', '-Command', $script
}

Start-Ventana 'ICONICS · backend :3001' $raiz `
  "node --env-file=.env.local backend/server.mjs"

$banderas = if ($SinPrototipos) { '' } else {
  "`$env:VITE_ENABLE_SIMULATOR='true'; `$env:VITE_ENABLE_PROTOTYPES='true'; "
}
Start-Ventana 'ICONICS · vite :5173' $frontend "$banderas npm run dev"

Write-Host ''
Write-Host '  backend   http://localhost:3001   (build de planta, sin prototipos)' -ForegroundColor DarkGray
Write-Host '  frontend  http://localhost:5173   <- abre esta' -ForegroundColor Cyan
if (-not $SinPrototipos) {
  Write-Host '            con Planta v2, Sandbox y las 12 propuestas' -ForegroundColor DarkGray
}

# Las mismas URLs para el resto de la red. Se listan aqui y no solo en la
# ventana de Vite porque son las que hay que repartir, y quien arranca el
# entorno no siempre sabe cual de las interfaces comparte subred con el equipo
# que va a mirar. Se descartan las de enlace local (169.254.x): no llevan a
# ninguna parte y solo hacen ruido en la lista.
$ips = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
  Sort-Object InterfaceAlias

if ($ips) {
  Write-Host ''
  Write-Host '  desde la red:' -ForegroundColor DarkGray
  foreach ($ip in $ips) {
    Write-Host ("    http://{0}:5173   ({1})" -f $ip.IPAddress, $ip.InterfaceAlias) -ForegroundColor Gray
  }
  Write-Host '    si el ping llega pero el puerto no: scripts\exponer-en-red.ps1 (como admin)' -ForegroundColor DarkGray
}
Write-Host ''
