<#
.SYNOPSIS
  Compila y arranca el backend y Vite en terminales independientes.
.DESCRIPTION
  El backend sirve dist en :3001; Vite ofrece recarga en caliente en :5173
  y reenvia /api al backend. La simulacion se configura con ICONICS_FAKE
  en .env.local. No hay prototipos ni selector de simulacion del frontend.
.PARAMETER SinBuild
  Reutiliza el dist existente sin compilar.
.PARAMETER BasePath
  Subruta para el build. El valor local por defecto es /asistente/ para IIS.
  Usa / para servir directamente desde localhost:3001. El build configura
  VITE_BASE_PATH y VITE_API_BASE juntos; Vite de desarrollo usa la raiz.
.EXAMPLE
  .\scripts\dev.ps1 -BasePath /
.EXAMPLE
  .\scripts\dev.ps1 -SinBuild
#>
[CmdletBinding()]
param(
  [switch]$SinBuild,
  [string]$BasePath = '/asistente/'
)

$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $raiz '.env.local'
$frontend = Join-Path $raiz 'react-dashboard'

if (-not (Test-Path $envFile)) {
  throw "No existe $envFile. Copia .env.example y configura la URL de ICONICS y los servicios necesarios."
}
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
  throw "Faltan las dependencias del frontend. Ejecuta: cd react-dashboard; npm install"
}

# Se compila ANTES de arrancar nada, no en paralelo con los dos procesos: el
# backend en :3001 sirve `dist` desde el primer segundo, y arrancarlo contra
# un build a medio escribir serviria una pantalla rota o vieja sin que nada lo
# avisara. `npm run build` no vuela en Windows PowerShell 5.1: su codigo de
# salida solo llega a $LASTEXITCODE, nunca lanza por si mismo.
if (-not $SinBuild) {
  Write-Host ''
  if ($BasePath -and $BasePath -ne '/') {
    Write-Host "  compilando el frontend para vivir bajo '$BasePath' (npm run build)..." -ForegroundColor DarkGray
  } else {
    Write-Host '  compilando el frontend en la raiz (npm run build)...' -ForegroundColor DarkGray
  }
  Push-Location $frontend
  try {
    if ($BasePath -and $BasePath -ne '/') {
      # Solo para ESTE paso: VITE_BASE_PATH mueve todas las rutas de assets
      # del HTML a la subruta, y VITE_API_BASE hace lo mismo para las
      # llamadas a /api/... del propio frontend (ver lib/api/apiBase.js).
      # Las dos, o ninguna -mezclar una subruta de assets con /api en la raiz
      # deja la mitad de las peticiones fuera del proxy inverso de IIS.
      $env:VITE_BASE_PATH = $BasePath
      $env:VITE_API_BASE = $BasePath.TrimEnd('/')
    }
    npm run build
    if ($LASTEXITCODE -ne 0) {
      throw "npm run build fallo (codigo $LASTEXITCODE). Revisa el error de arriba; -SinBuild lo salta si ya tienes un dist valido."
    }
  } finally {
    if ($BasePath) {
      Remove-Item Env:\VITE_BASE_PATH -ErrorAction SilentlyContinue
      Remove-Item Env:\VITE_API_BASE -ErrorAction SilentlyContinue
    }
    Pop-Location
  }
  Write-Host '  build listo' -ForegroundColor DarkGray
}

# pwsh si esta; si no, Windows PowerShell. El script funciona en ambos.
$shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }

function Start-Ventana([string]$titulo, [string]$directorio, [string]$comando) {
  $script = "`$Host.UI.RawUI.WindowTitle = '$titulo'; Set-Location '$directorio'; $comando"
  Start-Process $shell -ArgumentList '-NoExit', '-Command', $script
}

Start-Ventana 'ICONICS · backend :3001' $raiz `
  "node --env-file=.env.local backend/server.mjs"

Start-Ventana 'ICONICS · vite :5173' $frontend 'npm run dev'

Write-Host ''
if ($BasePath -and $BasePath -ne '/') {
  Write-Host "  backend   :3001   compilado para vivir bajo '$BasePath' — NO abre suelto en localhost:3001$BasePath" -ForegroundColor DarkGray
  Write-Host "            hace falta el proxy inverso de IIS por delante (docs/PLAN-20-ASISTENTE.md §F7)" -ForegroundColor DarkGray
} else {
  Write-Host '  backend   http://localhost:3001   (build compilado)' -ForegroundColor DarkGray
}
Write-Host '  frontend  http://localhost:5173   <- abre esta' -ForegroundColor Cyan


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
