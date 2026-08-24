<#
.SYNOPSIS
  Arranca llama-server y whisper-server juntos, cada uno en su propia ventana.

.DESCRIPTION
  Son los dos procesos que le faltan al backend para el asistente completo
  (chat + dictado), aparte de node mismo. Igual que dev.ps1 con el backend y
  Vite: cada uno abre su propia ventana para que sus logs no se mezclen y un
  Ctrl+C corte solo el que corresponde.

  Los dos escuchan en 0.0.0.0 por defecto (pedido explicito, ver
  docs/PLAN-6-IA-LOCAL.md): SIN autenticacion de ninguna clase, asi que
  cualquiera que alcance estos puertos puede usarlos directo, sin pasar por
  el backend ni por sus protecciones (solo lectura, limite de peticiones,
  validacion de herramientas). -Local los restringe a 127.0.0.1.

  Si el ping a esta maquina llega pero los puertos no responden desde otro
  equipo, es el Firewall de Windows o el perfil de la red (revisa con
  Get-NetConnectionProfile / Get-NetFirewallProfile) — no hace falta tocar
  este script para eso.

.PARAMETER Local
  Restringe los dos servidores a 127.0.0.1 en vez de 0.0.0.0.

.PARAMETER Modelo
  Ruta del .gguf de llama-server. Por defecto el Qwen 4B en uso (ver
  docs/PLAN-6-IA-LOCAL.md): el 9B no entra entero en una GPU de 8 GB y sale
  20x mas lento.

.EXAMPLE
  .\scripts\ia-local.ps1

.EXAMPLE
  .\scripts\ia-local.ps1 -Local

.EXAMPLE
  # Si responde "la ejecucion de scripts esta deshabilitada en este sistema":
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ia-local.ps1
#>
[CmdletBinding()]
param(
  [switch] $Local,
  [string] $Modelo = 'C:\Users\USER\Desktop\llama-b9940-bin-win-cuda-12.4-x64\qwen3.5_4b\Qwen3.5-4B-UD-Q4_K_XL.gguf'
)

$ErrorActionPreference = 'Stop'

$llamaDir = 'C:\Users\USER\Desktop\llama-b9940-bin-win-cuda-12.4-x64'
$llamaExe = Join-Path $llamaDir 'llama-server.exe'
$raiz     = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path $llamaExe)) {
  throw "No esta llama-server.exe en: $llamaExe"
}
if (-not (Test-Path $Modelo)) {
  throw "No esta el modelo en: $Modelo`nPasa -Modelo con la ruta correcta si lo moviste o cambiaste de version."
}

$host_ = if ($Local) { '127.0.0.1' } else { '0.0.0.0' }

# pwsh si esta; si no, Windows PowerShell. Igual que dev.ps1.
$shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }

function Start-Ventana([string]$titulo, [string]$directorio, [string]$comando) {
  $script = "`$Host.UI.RawUI.WindowTitle = '$titulo'; Set-Location '$directorio'; $comando"
  Start-Process $shell -ArgumentList '-NoExit', '-Command', $script
}

Start-Ventana "llama-server :8080 ($host_)" $llamaDir `
  "& '$llamaExe' -m '$Modelo' --jinja --host $host_ --port 8080"

$argWhisper = if ($Local) { ' -Local' } else { '' }
Start-Ventana "whisper-server :8082 ($host_)" $raiz `
  ".\scripts\whisper.ps1$argWhisper"

Write-Host ''
Write-Host '  llama-server    ' -NoNewline -ForegroundColor Cyan
Write-Host "http://$($host_):8080"
Write-Host '  whisper-server  ' -NoNewline -ForegroundColor Cyan
Write-Host "http://$($host_):8082"
Write-Host ''
if (-not $Local) {
  Write-Host '  Los dos SIN autenticacion de ninguna clase: quien alcance el puerto entra.' -ForegroundColor Yellow
  Write-Host '  -Local los restringe a esta maquina si hace falta revertirlo.' -ForegroundColor Yellow
  Write-Host ''
}
Write-Host '  El backend sigue aparte: .\scripts\dev.ps1' -ForegroundColor DarkGray
Write-Host ''
