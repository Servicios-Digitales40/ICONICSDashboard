<#
.SYNOPSIS
  Arranca whisper-server para el dictado por voz del asistente.

.DESCRIPTION
  El dictado necesita un tercer proceso, aparte del backend y de llama-server:
  `whisper-server`, que mantiene el modelo de audio cargado y transcribe por
  HTTP. Este script lo levanta con los parametros correctos y comprueba antes
  lo que suele faltar, en vez de dejar que falle a medias.

  Por que un servidor y no `whisper-cli` por cada audio: cargar el modelo
  cuesta ~0,9 s cada vez, y sobre una transcripcion de 2 s eso es casi la mitad
  del tiempo tirado. Ver la cabecera de backend/ia/voz.mjs.

  El audio llega ya convertido a WAV de 16 kHz desde el navegador, asi que
  NO se arranca con --convert y no hace falta ffmpeg.

.PARAMETER Puerto
  Donde escucha. Por defecto 8082, para no chocar con llama-server (8080) ni
  con un servidor de embeddings (8081).

.PARAMETER Modelo
  Ruta del .bin de Whisper. Por defecto ggml-small.bin, que es el equilibrio
  razonable para espanol en CPU. En el servidor con GPU compensa medium.

.PARAMETER Idioma
  Idioma del dictado. Fijo y no 'auto' a proposito: con deteccion automatica,
  una frase corta con ruido de planta se confunde a menudo con portugues.

.EXAMPLE
  .\scripts\whisper.ps1
  .\scripts\whisper.ps1 -Modelo ..\whisper.cpp\models\ggml-medium.bin
#>
param(
  [int]    $Puerto = 8082,
  [string] $Modelo = '',
  [string] $Idioma = 'es',
  [int]    $Hilos  = 0
)

$ErrorActionPreference = 'Stop'

$whisper = 'C:\Users\Victor\Desktop\DemoIa\whisper.cpp'
$exe     = Join-Path $whisper 'bin\Release\whisper-server.exe'

if (-not $Modelo) { $Modelo = Join-Path $whisper 'models\ggml-small.bin' }

# Un hilo por nucleo fisico. Mas hilos que nucleos empeora: los hilos se pelean
# por la cache y la transcripcion tarda mas, no menos.
if ($Hilos -le 0) {
  $nucleos = (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum
  $Hilos = [Math]::Max(1, [Math]::Min(8, $nucleos))
}

<# ---- Comprobaciones, antes de arrancar ---- #>

if (-not (Test-Path $exe)) {
  Write-Host "No esta whisper-server.exe en:" -ForegroundColor Red
  Write-Host "  $exe"
  Write-Host ""
  Write-Host "Descarga los binarios ya compilados (no hace falta compilador):" -ForegroundColor Yellow
  Write-Host "  https://github.com/ggml-org/whisper.cpp/releases"
  Write-Host "  Coge whisper-blas-bin-x64.zip y descomprimelo en whisper.cpp\bin\"
  exit 1
}

if (-not (Test-Path $Modelo)) {
  Write-Host "No esta el modelo en:" -ForegroundColor Red
  Write-Host "  $Modelo"
  Write-Host ""
  Write-Host "Descargalo con:" -ForegroundColor Yellow
  Write-Host "  Invoke-WebRequest 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin' -OutFile '$Modelo'"
  exit 1
}

# Los .bin que trae el repo son stubs de prueba de 1 MB, no modelos. Sin esta
# comprobacion, whisper-server arranca y transcribe basura sin decir por que.
$tam = (Get-Item $Modelo).Length
if ($tam -lt 20MB) {
  Write-Host "El modelo pesa solo $([math]::Round($tam/1MB,1)) MB: no es un modelo real." -ForegroundColor Red
  Write-Host "Los archivos for-tests-*.bin del repositorio son stubs de prueba." -ForegroundColor Yellow
  exit 1
}

$ocupado = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue
if ($ocupado) {
  Write-Host "El puerto $Puerto ya esta ocupado (PID $($ocupado.OwningProcess))." -ForegroundColor Yellow
  Write-Host "Si es un whisper-server anterior, cierralo; o usa -Puerto con otro numero."
  exit 1
}

<# ---- Arranque ---- #>

Write-Host ""
Write-Host "whisper-server" -ForegroundColor Cyan
Write-Host "  modelo : $(Split-Path -Leaf $Modelo) ($([math]::Round($tam/1MB)) MB)"
Write-Host "  idioma : $Idioma"
Write-Host "  hilos  : $Hilos"
Write-Host "  escucha: http://127.0.0.1:$Puerto"
Write-Host ""
Write-Host "  Pon esto en .env.local para que el backend lo use:" -ForegroundColor DarkGray
Write-Host "    IA_WHISPER_BASE=http://127.0.0.1:$Puerto" -ForegroundColor DarkGray
Write-Host ""

# --host 127.0.0.1 y no 0.0.0.0: whisper-server no lleva autenticacion de
# ninguna clase, igual que llama-server. Quien tenga que alcanzarlo es el
# backend, que corre en la misma maquina.
& $exe `
  -m $Modelo `
  -l $Idioma `
  -t $Hilos `
  -nt `
  --host 127.0.0.1 `
  --port $Puerto
