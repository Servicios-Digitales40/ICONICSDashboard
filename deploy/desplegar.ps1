<#
.SINOPSIS
    Instala una release en el servidor de planta, o revierte a la anterior.

.DESCRIPCION
    Se ejecuta EN EL SERVIDOR, como administrador. No necesita git, ni
    node_modules, ni herramientas de compilación: sólo Node y el .zip que
    produjo `empaquetar.ps1`.

    La estructura que mantiene:

        D:\IconicsDashboard\
        ├── releases\
        │   ├── 1a2b3c4\        una carpeta por release, intacta tras copiarla
        │   └── 9f8e7d6\        la anterior: es la reversión
        ├── current  →  junction a la release activa
        ├── config\.env.production
        └── logs\

    `current` es un *junction* de NTFS y el servicio apunta siempre ahí.
    Cambiar de versión es rehacer el enlace y reiniciar: dos operaciones, sin
    recompilar y sin red. Es lo que sustituye al «cambiar la etiqueta de la
    imagen» que daría un registro de contenedores, y sin ello una reversión a
    las tres de la mañana obligaría a recompilar en una máquina que no tiene
    con qué.

    El orden importa: la release se prueba EN UN PUERTO APARTE antes de
    dirigirle tráfico. Si el humo falla, no se toca nada y la versión que
    estaba sirviendo sigue sirviendo.

.PARAMETER Paquete
    Ruta al .zip (o a una carpeta ya extraída) de la release.

.PARAMETER Raiz
    Directorio de instalación. Por defecto D:\IconicsDashboard.

.PARAMETER Servicio
    Nombre del servicio de Windows. Por defecto IconicsDashboard.

.PARAMETER Revertir
    Ignora -Paquete y vuelve a la release anterior a la activa.

.EJEMPLO
    .\desplegar.ps1 -Paquete C:\temp\dashboard-1a2b3c4.zip
    .\desplegar.ps1 -Revertir

.NOTAS
    Escrito para funcionar en Windows PowerShell 5.1, que es el que trae un
    Windows Server de fábrica: no hace falta instalar PowerShell 7 en el
    servidor sólo para desplegar. Si algo se retoca aquí, conviene no meter
    sintaxis de 7 (operador ternario, `??`, `Start-Process -Environment`).
#>
#Requires -Version 5.1
[CmdletBinding(DefaultParameterSetName = "Instalar")]
param(
  [Parameter(ParameterSetName = "Instalar", Mandatory = $true)]
  [string]$Paquete,

  [Parameter(ParameterSetName = "Revertir", Mandatory = $true)]
  [switch]$Revertir,

  [string]$Raiz = "D:\IconicsDashboard",
  [string]$Servicio = "IconicsDashboard",

  # Puerto donde se prueba la release antes de darle tráfico. Tiene que estar
  # libre y ser distinto del de producción.
  [int]$PuertoHumo = 3999
)

$ErrorActionPreference = "Stop"

function Paso($t) { Write-Host "`n── $t " -ForegroundColor Cyan -NoNewline; Write-Host ("─" * [Math]::Max(0, 58 - $t.Length)) -ForegroundColor DarkGray }
function Bien($t) { Write-Host "  OK  " -ForegroundColor Green -NoNewline; Write-Host $t }
function Aviso($t) { Write-Host "  !!  " -ForegroundColor Yellow -NoNewline; Write-Host $t }

$Releases = Join-Path $Raiz "releases"
$Current  = Join-Path $Raiz "current"

function Es-Administrador {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return ([Security.Principal.WindowsPrincipal]$id).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
}

<#
  Se exigen privilegios sólo si hay servicio que reiniciar, que es lo único
  que los necesita de verdad —un junction de directorio lo crea cualquiera—.
  Así un ensayo sobre una raíz de prueba, sin servicio, se puede lanzar sin
  elevar, y la comprobación sigue protegiendo el caso real.

  Y se comprueba ANTES de tocar nada: fallar a mitad, con `current` ya
  borrado y el servicio apuntando a un enlace que no existe, deja el tablero
  caído por una razón evitable.
#>
if ((Get-Service $Servicio -ErrorAction SilentlyContinue) -and -not (Es-Administrador)) {
  throw "El servicio '$Servicio' existe, así que hay que reiniciarlo: abre PowerShell como administrador."
}

function Version-Activa {
  if (-not (Test-Path $Current)) { return $null }

  # `.Target` devuelve una cadena en PowerShell 7 y una COLECCIÓN en 5.1.
  # Sin este desempaquetado, en el servidor `Split-Path` recibiría un array y
  # la versión activa saldría vacía justo cuando hace falta para revertir.
  $destino = (Get-Item $Current).Target
  if ($destino -is [array]) { $destino = $destino[0] }
  if (-not $destino) { return $null }

  return Split-Path $destino -Leaf
}

<#
  Humo sobre una release CONCRETA, antes de que sirva a nadie.

  Arranca el proceso en un puerto aparte y sin ICONICS configurado: lo que se
  comprueba aquí es que el paquete está completo y arranca —que el bundle
  está, que los módulos se resuelven, que el puerto se abre—, no que la planta
  responda. Un ICONICS caído no debe impedir desplegar; un paquete a medias sí.
#>
function Probar-Release($carpeta) {
  $server = Join-Path $carpeta "backend\server.mjs"
  $publico = Join-Path $carpeta "public"

  if (-not (Test-Path $server))  { throw "El paquete no tiene backend\server.mjs" }
  if (-not (Test-Path (Join-Path $publico "index.html"))) { throw "El paquete no tiene public\index.html" }

  # Las variables se ponen en ESTE proceso y se restauran después, en vez de
  # usar `Start-Process -Environment`: ese parámetro no existe en Windows
  # PowerShell 5.1, que es el que trae un Windows Server de fábrica, y el
  # guion tiene que correr allí sin instalar nada.
  $previas = @{}
  $entorno = @{
    PORT       = "$PuertoHumo"
    STATIC_DIR = $publico
    LOG_LEVEL  = "ERROR"
    NODE_ENV   = "production"
  }
  foreach ($clave in $entorno.Keys) {
    $previas[$clave] = [Environment]::GetEnvironmentVariable($clave)
    Set-Item "env:$clave" $entorno[$clave]
  }

  $proceso = Start-Process node -PassThru -WindowStyle Hidden -ArgumentList $server

  try {
    $listo = $false
    foreach ($i in 1..20) {
      Start-Sleep -Milliseconds 500
      try {
        $r = Invoke-WebRequest "http://127.0.0.1:$PuertoHumo/api/health/live" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $listo = $true; break }
      } catch { }
    }
    if (-not $listo) { throw "La release no respondió en $PuertoHumo tras 10 s." }

    $html = (Invoke-WebRequest "http://127.0.0.1:$PuertoHumo/" -UseBasicParsing -TimeoutSec 5).Content
    if ($html -notmatch '<div id="root">') { throw "La raíz no devolvió el tablero." }

    # El bundle de planta no lleva vistas de propuesta. Si aparecen, alguien
    # empaquetó un build de demo y no debe llegar a la pared.
    $propuestas = @(Get-ChildItem (Join-Path $publico "assets") -Filter *.js |
      Where-Object { $_.Name -match 'Sandbox|DashboardV2|Area[12]|variants' })
    if ($propuestas.Count -gt 0) {
      throw "El paquete contiene $($propuestas.Count) trozo(s) de vistas de propuesta: es un build de DEMO."
    }
  }
  finally {
    if (-not $proceso.HasExited) { Stop-Process -Id $proceso.Id -Force -ErrorAction SilentlyContinue }
    foreach ($clave in $previas.Keys) {
      if ($null -eq $previas[$clave]) { Remove-Item "env:$clave" -ErrorAction SilentlyContinue }
      else { Set-Item "env:$clave" $previas[$clave] }
    }
  }
}

<#
  Sincroniza APP_VERSION en el .env.production con la release que se activa.

  Sin esto, `/api/health` y el Topbar seguirían anunciando la versión del
  despliegue anterior, y eso es peor que no anunciar ninguna: la primera
  pregunta ante «este número está mal» es si esa pantalla ya tiene el
  arreglo, y una respuesta equivocada manda a buscar donde no es.

  Se reescribe sólo esa línea; el resto del archivo —credenciales incluidas—
  se conserva tal cual.
#>
function Sincronizar-Version($version) {
  $env_prod = Join-Path $Raiz "config\.env.production"
  if (-not (Test-Path $env_prod)) {
    Aviso "no hay config\.env.production: APP_VERSION no se puede sincronizar"
    return
  }

  $lineas = Get-Content $env_prod
  if ($lineas -match '^\s*APP_VERSION\s*=') {
    $lineas = $lineas -replace '^\s*APP_VERSION\s*=.*', "APP_VERSION=$version"
  } else {
    $lineas += "APP_VERSION=$version"
  }
  Set-Content $env_prod $lineas -Encoding UTF8

  Bien "APP_VERSION=$version en el .env.production"
}

function Apuntar-Current($carpeta) {
  if (Test-Path $Current) { (Get-Item $Current).Delete() }
  cmd /c mklink /J "$Current" "$carpeta" | Out-Null
  if (-not (Test-Path $Current)) { throw "No se pudo crear el junction $Current" }
}

# Devuelve $true sólo si de verdad reinició algo. Antes anunciaba «servicio
# reiniciado» aunque el servicio no existiera, que es la clase de mensaje que
# hace perder media hora buscando por qué no se aplican los cambios.
function Reiniciar-Servicio {
  if (-not (Get-Service $Servicio -ErrorAction SilentlyContinue)) {
    Aviso "el servicio '$Servicio' no existe todavía (ver instalar-servicio.ps1)"
    Aviso "la release queda instalada y activa, pero NADIE la está sirviendo"
    return $false
  }

  Restart-Service $Servicio -Force
  Start-Sleep -Seconds 3

  if ((Get-Service $Servicio).Status -ne "Running") {
    throw "El servicio '$Servicio' no arrancó. Mira $Raiz\logs\dashboard.err.log"
  }
  return $true
}

Write-Host "`nDespliegue del tablero ICONICS" -ForegroundColor White
Write-Host "raíz: $Raiz" -ForegroundColor DarkGray

$anterior = Version-Activa
if ($anterior) { Write-Host "activa ahora: $anterior" -ForegroundColor DarkGray }

# ── Reversión ─────────────────────────────────────────────────────────
if ($Revertir) {
  Paso "Reversión"

  $candidatas = @(Get-ChildItem $Releases -Directory | Sort-Object LastWriteTime -Descending |
    Where-Object { $_.Name -ne $anterior })
  if ($candidatas.Count -eq 0) { throw "No hay ninguna release anterior a la que volver." }

  $destino = $candidatas[0]
  Bien "volviendo a $($destino.Name) (de $($destino.LastWriteTime))"

  Apuntar-Current $destino.FullName
  Sincronizar-Version $destino.Name
  if (Reiniciar-Servicio) { Bien "servicio reiniciado" }
  Bien "revertido a $($destino.Name)"
  Write-Host "`nReversión completa. La release $anterior sigue en disco por si hay que volver.`n" -ForegroundColor Green
  return
}

# ── Instalación ───────────────────────────────────────────────────────
Paso "Estructura"
foreach ($d in $Releases, (Join-Path $Raiz "config"), (Join-Path $Raiz "logs")) {
  New-Item -ItemType Directory -Force $d | Out-Null
}
Bien "releases\, config\ y logs\ en su sitio"

Paso "Extracción"
<#
  Si la ruta no existe, se buscan paquetes cerca y se ofrecen por su nombre.

  El error escueto —«No existe el paquete: X»— es correcto y no sirve de nada:
  deja al que despliega adivinando si se equivocó de carpeta, de version o de
  extension. Los dos tropiezos reales fueron pegar una ruta de EJEMPLO de la
  documentacion y pegar un marcador `<nueva-version>` sin sustituir; en ambos
  casos el paquete bueno estaba a un `dir` de distancia.
#>
<#
  ¿Existe esa ruta? Devuelve un booleano de verdad, pase lo que pase.

  Dos trampas, y las dos costaron una depuración:

  1. `Test-Path` LANZA —no devuelve $false— cuando la ruta tiene caracteres
     ilegales como `<` o `>`, que es justo lo que ocurre al pegar un marcador
     de la documentación sin sustituir. Por eso se descartan ANTES, con la
     lista del propio .NET, en vez de confiar en atrapar la excepción.

  2. Envolver `Test-Path` en try/catch no bastaba: la versión anterior
     devolvía DOS valores (`False False`), y en PowerShell un array de dos
     elementos es **verdadero** aunque ambos sean falsos. La comprobación
     pasaba de largo y el guion moría más adelante, en `Get-Item`, con el
     mismo mensaje que se pretendía evitar. De ahí el `[bool]` explícito.
#>
function Existe-Ruta($ruta) {
  if ([string]::IsNullOrWhiteSpace($ruta)) { return $false }
  if ($ruta.IndexOfAny([IO.Path]::GetInvalidPathChars()) -ge 0) { return $false }

  try { return [bool](Test-Path -LiteralPath $ruta) } catch { return $false }
}

if (-not (Existe-Ruta $Paquete)) {
  $donde = @(
    (Join-Path (Split-Path $PSScriptRoot -Parent) "dist-release"),
    (Join-Path $PWD "dist-release"),
    $PWD,
    $PSScriptRoot
  ) | Select-Object -Unique | Where-Object { Test-Path $_ }

  $encontrados = @($donde | ForEach-Object {
    Get-ChildItem $_ -Filter "dashboard-*.zip" -ErrorAction SilentlyContinue
  } | Sort-Object LastWriteTime -Descending | Select-Object -Unique -First 5)

  $mensaje = "No existe el paquete: $Paquete"
  if ($Paquete -match '[<>]') {
    $mensaje += "`n`nEsa ruta lleva un marcador sin sustituir (<...>): copiala del nombre real."
  }
  if ($encontrados.Count -gt 0) {
    $mensaje += "`n`nPaquetes encontrados, del mas reciente al mas antiguo:`n"
    foreach ($p in $encontrados) { $mensaje += "`n    $($p.FullName)" }
    $mensaje += "`n`nPor ejemplo:`n`n    .\desplegar.ps1 -Paquete `"$($encontrados[0].FullName)`""
    if ($Raiz -ne "D:\IconicsDashboard") { $mensaje += " -Raiz `"$Raiz`"" }
  } else {
    $mensaje += "`n`nNo se ha encontrado ningun dashboard-*.zip cerca. Genera uno con"
    $mensaje += "`ndeploy\empaquetar.ps1 en la maquina de desarrollo y copialo aqui."
  }
  throw $mensaje
}

$temporal = Join-Path $env:TEMP "dashboard-release-$(Get-Random)"
if ((Get-Item -LiteralPath $Paquete).PSIsContainer) {
  Copy-Item -LiteralPath $Paquete $temporal -Recurse
} else {
  Expand-Archive -LiteralPath $Paquete -DestinationPath $temporal
}

$versionArchivo = Join-Path $temporal "VERSION"
if (-not (Test-Path $versionArchivo)) { throw "El paquete no trae VERSION: ¿es una release de empaquetar.ps1?" }
$version = (Get-Content $versionArchivo | Select-Object -First 1).Trim()
Bien "versión del paquete: $version"

if ($version -eq $anterior) { Aviso "esa versión ya es la activa; se reinstala igualmente" }

$destino = Join-Path $Releases $version
if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
Move-Item $temporal $destino
Bien "instalada en $destino"

Paso "Humo (puerto $PuertoHumo, sin tocar producción)"
Probar-Release $destino
Bien "arranca, sirve el tablero y es un build de planta"

Paso "Activación"
Apuntar-Current $destino
Bien "current → $version"
Sincronizar-Version $version

if (Reiniciar-Servicio) { Bien "servicio reiniciado" }

# ── Comprobación final ────────────────────────────────────────────────
Paso "Verificación"
try {
  $salud = (Invoke-WebRequest "http://127.0.0.1:3001/api/health" -UseBasicParsing -TimeoutSec 10).Content | ConvertFrom-Json
  Bien "estado: $($salud.status) · versión que reporta: $($salud.version)"

  if ($salud.version -ne "dev" -and $salud.version -ne $version) {
    Aviso "la versión que reporta ($($salud.version)) no es la desplegada ($version)"
    Aviso "revisa APP_VERSION en $Raiz\config\.env.production"
  }
  if ($salud.status -ne "ok") {
    Aviso "el tablero sirve, pero no llega a ICONICS o no autentica (status: $($salud.status))"
    Aviso "eso NO es del despliegue: mira credenciales, red y la CA del servidor"
  }
} catch {
  Aviso "no se pudo consultar /api/health: $($_.Exception.Message)"
  Aviso "si IIS está delante, prueba también https://<host>/api/health"
}

Write-Host "`nDesplegada la versión $version." -ForegroundColor Green
if ($anterior) {
  Write-Host "Para volver atrás:  .\desplegar.ps1 -Revertir   (te devuelve a $anterior)`n" -ForegroundColor DarkGray
}
