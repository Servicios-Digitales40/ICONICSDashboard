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

           El script compila `dist` antes de arrancar (`npm run build`), asi
           que :3001 siempre enseña el build de HOY y no uno de hace tres
           dias. Es un paso mas de arranque -unos segundos-, saltable con
           -SinBuild si ya compilaste y solo quieres reiniciar rapido.

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

.PARAMETER SinBuild
  Se salta el `npm run build` y arranca con el `dist` que ya hubiera. Para
  cuando acabas de compilar y solo quieres reiniciar los dos procesos rapido;
  sin este parametro, :3001 puede quedarse enseñando un build de una sesion
  anterior sin que nada lo avise.

.PARAMETER BasePath
  Compila el frontend para vivir bajo una SUBRUTA, no en la raiz del origen
  que lo sirve -por ejemplo "/asistente/", cuando IIS reenvia esa subruta de
  bms-server hacia este backend para el SSO silencioso del HMI de ICONICS
  (docs/PLAN-20-ASISTENTE.md). Pone VITE_BASE_PATH y VITE_API_BASE SOLO para
  el paso de `npm run build`; sin este parametro compila en la raiz, como
  siempre.

  OJO: sin `-BasePath`, este script vuelve a compilar en la raiz aunque el
  `dist` de antes estuviera hecho para una subruta -es lo que este parametro
  existe para evitar que se te olvide un dia que estes probando eso.

.EXAMPLE
  .\scripts\dev.ps1

.EXAMPLE
  .\scripts\dev.ps1 -SinBuild

.EXAMPLE
  # Recompila para vivir bajo /asistente/ (proxy inverso de IIS)
  .\scripts\dev.ps1 -BasePath /asistente/

.EXAMPLE
  # Si responde "la ejecucion de scripts esta deshabilitada en este sistema":
  # Windows PowerShell 5.1 viene en Restricted de fabrica, y su politica es
  # independiente de la de PowerShell 7. El Bypass afecta solo a esta llamada.
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1
#>
[CmdletBinding()]
param(
  [switch]$SinPrototipos,
  [switch]$SinBuild,
  [string]$BasePath
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

# Se compila ANTES de arrancar nada, no en paralelo con los dos procesos: el
# backend en :3001 sirve `dist` desde el primer segundo, y arrancarlo contra
# un build a medio escribir serviria una pantalla rota o vieja sin que nada lo
# avisara. `npm run build` no vuela en Windows PowerShell 5.1: su codigo de
# salida solo llega a $LASTEXITCODE, nunca lanza por si mismo.
if (-not $SinBuild) {
  Write-Host ''
  if ($BasePath) {
    Write-Host "  compilando el frontend para vivir bajo '$BasePath' (npm run build)..." -ForegroundColor DarkGray
  } else {
    Write-Host '  compilando el frontend (npm run build)...' -ForegroundColor DarkGray
  }
  Push-Location $frontend
  try {
    if ($BasePath) {
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

$banderas = if ($SinPrototipos) { '' } else {
  "`$env:VITE_ENABLE_SIMULATOR='true'; `$env:VITE_ENABLE_PROTOTYPES='true'; "
}
Start-Ventana 'ICONICS · vite :5173' $frontend "$banderas npm run dev"

Write-Host ''
if ($BasePath) {
  Write-Host "  backend   http://localhost:3001$BasePath   (compilado para vivir bajo '$BasePath' — no abre en la raiz)" -ForegroundColor DarkGray
} else {
  Write-Host '  backend   http://localhost:3001   (build de planta, sin prototipos)' -ForegroundColor DarkGray
}
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
