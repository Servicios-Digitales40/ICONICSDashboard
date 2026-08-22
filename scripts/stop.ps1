<#
.SYNOPSIS
  Apaga el entorno de desarrollo levantado por dev.ps1: backend puente y
  dev server de Vite.

.DESCRIPTION
  dev.ps1 abre cada proceso en su propia ventana de consola, asi que Ctrl+C
  en una sola no basta si hay varias abiertas o si alguna quedo en segundo
  plano. Este script no depende de encontrar esas ventanas: busca quien esta
  escuchando en los puertos del tablero (3001 y 5173) y termina ese proceso
  directamente. Es lo mismo que cerrar la ventana, pero funciona igual si la
  ventana se cerro por error, quedo minimizada, o el proceso se lanzo de otra
  forma.

  Si ademas dejaste abierto el preview del build (4173) o dejaste corriendo
  `exponer-en-red.ps1`, este script no toca el Firewall: solo los procesos.

.EXAMPLE
  .\scripts\stop.ps1

.EXAMPLE
  # Si responde "la ejecucion de scripts esta deshabilitada en este sistema":
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop.ps1
#>
[CmdletBinding()]
param()

# Con nombre: el numero suelto en un mensaje no dice a quien pertenece.
$PUERTOS = @(
  @{ Puerto = 3001; Nombre = 'backend' }
  @{ Puerto = 5173; Nombre = 'vite dev' }
)

$algoParado = $false

foreach ($p in $PUERTOS) {
  # Puede haber mas de un proceso escuchando el mismo puerto en estados
  # transitorios (TIME_WAIT de una ejecucion anterior); se paran todos.
  $conexiones = Get-NetTCPConnection -LocalPort $p.Puerto -State Listen -ErrorAction SilentlyContinue

  if (-not $conexiones) {
    Write-Host "  $($p.Nombre) (:$($p.Puerto))  no estaba corriendo" -ForegroundColor DarkGray
    continue
  }

  $pids = $conexiones | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $pids) {
    $proceso = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $proceso) { continue }

    Stop-Process -Id $processId -Force
    Write-Host "  $($p.Nombre) (:$($p.Puerto))  detenido  [$($proceso.ProcessName) PID $processId]" -ForegroundColor Green
    $algoParado = $true
  }
}

Write-Host ''
if ($algoParado) {
  Write-Host '  Entorno apagado.' -ForegroundColor Cyan
} else {
  Write-Host '  No habia nada corriendo en 3001 ni 5173.' -ForegroundColor Cyan
}
Write-Host ''
