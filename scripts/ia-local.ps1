<#
.SYNOPSIS
  Arranca llama-server, whisper-server y el servidor de embeddings juntos,
  cada uno en su propia ventana.

.DESCRIPTION
  Son los tres procesos que le faltan al backend para el asistente completo
  (chat + dictado + busqueda semantica sobre la documentacion), aparte de
  node mismo. Igual que dev.ps1 con el backend y Vite: cada uno abre su
  propia ventana para que sus logs no se mezclen y un Ctrl+C corte solo el
  que corresponde.

  Los tres escuchan en 0.0.0.0 por defecto (pedido explicito, ver
  docs/PLAN-6-IA-LOCAL.md): SIN autenticacion de ninguna clase, asi que
  cualquiera que alcance estos puertos puede usarlos directo, sin pasar por
  el backend ni por sus protecciones (solo lectura, limite de peticiones,
  validacion de herramientas). -Local los restringe a 127.0.0.1.

  El servidor de embeddings es otra instancia de llama-server, arrancada con
  --embedding sobre un modelo dedicado (Qwen3-Embedding), en el puerto 8081.
  No usa --models-preset: llama-server sirve un modelo a la vez, y este no es
  el mismo que atiende el chat. Ver backend/config.mjs (embeddingBase).

  Si el ping a esta maquina llega pero los puertos no responden desde otro
  equipo, es el Firewall de Windows o el perfil de la red (revisa con
  Get-NetConnectionProfile / Get-NetFirewallProfile) — no hace falta tocar
  este script para eso.

.PARAMETER Local
  Restringe los tres servidores a 127.0.0.1 en vez de 0.0.0.0.

.PARAMETER Presets
  Ruta del .ini de presets de llama-server (--models-preset): una seccion por
  modelo (Qwen 4B, Qwen 9B, LFM, etc.), cada una con su .gguf, mmproj y
  ctx-size. Por defecto model.ini junto a llama-server.exe. Con esto
  llama-server sirve varios modelos y se cambia de uno a otro sin reiniciar
  el proceso; ver docs/PLAN-6-IA-LOCAL.md para cual esta en uso y por que.

.PARAMETER EmbeddingModelo
  Ruta del .gguf del modelo de embeddings. Por defecto
  Qwen3-Embedding-0.6B-f16.gguf en la carpeta de embeddings de la maquina de
  IA.

.PARAMETER CtxSize
  Sobreescribe el "ctx-size" de CADA seccion del .ini de presets, sin tocar
  el archivo original: se genera una copia temporal (en $env:TEMP) con el
  valor pedido y se lanza llama-server apuntando a esa copia. --models-preset
  no admite un --ctx-size de linea de comandos que gane sobre el del .ini —
  el contexto es un dato POR MODELO dentro del preset, asi que la unica forma
  de subirlo sin editar a mano es reescribir esa seccion antes de arrancar.

  Motivo (Plan 27, 10-09-2026): con el catalogo del tanque en 52 senales, las
  instrucciones del sistema mas el esquema de las 22 herramientas del
  asistente ya rondan los 10.300 tokens ANTES de cualquier pregunta, y
  estado_del_sistema puede sumar varios miles mas con la planta en un mal
  momento — con ctx-size=16384 (el valor que traen las secciones del .ini de
  esta maquina) una pregunta real desbordo el contexto. Ver
  docs/PLAN-27-VARIABLES-DEL-TANQUE.md.

.EXAMPLE
  .\scripts\ia-local.ps1

.EXAMPLE
  .\scripts\ia-local.ps1 -Local

.EXAMPLE
  .\scripts\ia-local.ps1 -CtxSize 32768

.EXAMPLE
  # Si responde "la ejecucion de scripts esta deshabilitada en este sistema":
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ia-local.ps1
#>
[CmdletBinding()]
param(
  [switch] $Local,
  [string] $Presets = 'C:\Users\USER\Desktop\IA\llama-b9940-bin-win-cuda-12.4-x64\model.ini',
  [string] $EmbeddingModelo = 'C:\Users\USER\Desktop\IA\embeddings\Qwen3-Embedding-0.6B-f16.gguf',
  [Nullable[int]] $CtxSize = $null
)

$ErrorActionPreference = 'Stop'

$llamaDir = 'C:\Users\USER\Desktop\IA\llama-b9940-bin-win-cuda-12.4-x64'
$llamaExe = Join-Path $llamaDir 'llama-server.exe'
$raiz     = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path $llamaExe)) {
  throw "No esta llama-server.exe en: $llamaExe"
}
if (-not (Test-Path $Presets)) {
  throw "No esta el archivo de presets en: $Presets`nPasa -Presets con la ruta correcta si lo moviste."
}
if (-not (Test-Path $EmbeddingModelo)) {
  throw "No esta el modelo de embeddings en: $EmbeddingModelo`nPasa -EmbeddingModelo con la ruta correcta si lo moviste."
}

$host_ = if ($Local) { '127.0.0.1' } else { '0.0.0.0' }

# -CtxSize: copia el .ini a $env:TEMP con "ctx-size" reemplazado (o anadido,
# si una seccion no lo traia) en CADA seccion [Modelo]. El original nunca se
# toca — la copia se regenera en cada arranque, asi que un -CtxSize de una
# sesion no se queda pegado en la siguiente por accidente.
$presetsEfectivo = $Presets
if ($PSBoundParameters.ContainsKey('CtxSize')) {
  $lineas = Get-Content -LiteralPath $Presets
  $salida = New-Object System.Collections.Generic.List[string]
  $dentroDeSeccion = $false

  foreach ($linea in $lineas) {
    if ($linea -match '^\s*\[.+\]\s*$') {
      $dentroDeSeccion = $true
      $salida.Add($linea)
      # El ctx-size va JUSTO DEBAJO de su [Seccion]; cualquier "ctx-size ="
      # que la seccion ya trajera se descarta mas abajo para no duplicarlo.
      $salida.Add("ctx-size = $CtxSize")
      continue
    }
    if ($dentroDeSeccion -and $linea -match '^\s*ctx-size\s*=') {
      continue
    }
    $salida.Add($linea)
  }

  $presetsEfectivo = Join-Path $env:TEMP 'ia-local-presets-ctx.ini'
  Set-Content -LiteralPath $presetsEfectivo -Value $salida -Encoding UTF8
  Write-Host "  ctx-size forzado a $CtxSize en cada modelo del preset (copia: $presetsEfectivo)" -ForegroundColor Yellow
  Write-Host ''
}

# pwsh si esta; si no, Windows PowerShell. Igual que dev.ps1.
$shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }

function Start-Ventana([string]$titulo, [string]$directorio, [string]$comando) {
  $script = "`$Host.UI.RawUI.WindowTitle = '$titulo'; Set-Location '$directorio'; $comando"
  Start-Process $shell -ArgumentList '-NoExit', '-Command', $script
}

Start-Ventana "llama-server :8080 ($host_)" $llamaDir `
  "& '$llamaExe' --models-preset '$presetsEfectivo' --jinja --host $host_ --port 8080"

Start-Ventana "embeddings :8081 ($host_)" $llamaDir `
  "& '$llamaExe' -m '$EmbeddingModelo' --embedding --host $host_ --port 8081"

$argWhisper = if ($Local) { ' -Local' } else { '' }
Start-Ventana "whisper-server :8082 ($host_)" $raiz `
  ".\scripts\whisper.ps1$argWhisper"

Write-Host ''
Write-Host '  llama-server    ' -NoNewline -ForegroundColor Cyan
Write-Host "http://$($host_):8080"
Write-Host '  embeddings      ' -NoNewline -ForegroundColor Cyan
Write-Host "http://$($host_):8081"
Write-Host '  whisper-server  ' -NoNewline -ForegroundColor Cyan
Write-Host "http://$($host_):8082"
Write-Host ''
Write-Host '  Pon esto en .env.local para que el backend use embeddings:' -ForegroundColor DarkGray
Write-Host '    IA_EMBEDDING_BASE=http://127.0.0.1:8081' -ForegroundColor DarkGray
Write-Host ''
if (-not $Local) {
  Write-Host '  Los tres SIN autenticacion de ninguna clase: quien alcance el puerto entra.' -ForegroundColor Yellow
  Write-Host '  -Local los restringe a esta maquina si hace falta revertirlo.' -ForegroundColor Yellow
  Write-Host ''
}
Write-Host '  El backend sigue aparte: .\scripts\dev.ps1' -ForegroundColor DarkGray
Write-Host ''
