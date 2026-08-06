<#
.SINOPSIS
    Construye el paquete de release del tablero ICONICS.

.DESCRIPCION
    Se ejecuta en una máquina de DESARROLLO, no en el servidor de planta: allí
    no hace falta ni git, ni node_modules, ni herramientas de compilación. La
    salida es una carpeta y un .zip que se copian tal cual.

    El guion se niega a producir un paquete si algo no cuadra, y esa es su
    única razón de ser. Comprueba, por este orden:

      1. Que no haya banderas de desarrollo en el entorno. `VITE_ICONICS_FAKE`
         y `VITE_ENABLE_DEMO` se hornean en el bundle: un paquete compilado con
         ellas queda pegado al simulador o trae el interruptor de datos
         inventados, y ninguna de las dos cosas se nota mirando la pantalla.

      2. Que el árbol de git esté limpio. Una versión con `-dirty` no
         identifica nada, y es justo la que acaba en la pantalla que nadie sabe
         reproducir.

      3. Que pasen las dos suites: el contrato del backend y las pruebas del
         frontend. Si no pasan, no hay paquete.

.PARAMETER Salida
    Carpeta donde dejar la release. Por defecto `dist-release/` en la raíz.

.PARAMETER SaltarPruebas
    Salta las suites. Para iterar sobre el propio empaquetado, NUNCA para una
    release: el paquete queda marcado como no verificado en su VERSION.

.PARAMETER PermitirArbolSucio
    Permite empaquetar con cambios sin confirmar. Para ensayos locales. La
    versión llevará el sufijo `-dirty`, que es su propio aviso.

.EJEMPLO
    .\deploy\empaquetar.ps1
    .\deploy\empaquetar.ps1 -PermitirArbolSucio -SaltarPruebas   # ensayo
#>
[CmdletBinding()]
param(
  [string]$Salida,
  [switch]$SaltarPruebas,
  [switch]$PermitirArbolSucio
)

$ErrorActionPreference = "Stop"

# La raíz del repo se deduce de dónde vive este guion, no del directorio
# actual: así funciona igual lanzado desde la raíz, desde deploy\ o desde un
# acceso directo.
$Raiz = Split-Path $PSScriptRoot -Parent
if (-not $Salida) { $Salida = Join-Path $Raiz "dist-release" }

function Paso($texto) { Write-Host "`n── $texto " -ForegroundColor Cyan -NoNewline; Write-Host ("─" * [Math]::Max(0, 60 - $texto.Length)) -ForegroundColor DarkGray }
function Bien($texto) { Write-Host "  OK  " -ForegroundColor Green -NoNewline; Write-Host $texto }
function Aviso($texto) { Write-Host "  !!  " -ForegroundColor Yellow -NoNewline; Write-Host $texto }

<#
  Un comando externo que falla NO detiene el guion por sí solo: PowerShell
  sólo aplica `$ErrorActionPreference` a los errores de sus propios cmdlets, y
  deja `$LASTEXITCODE` para el resto. Sin esta envoltura, una suite en rojo
  seguiría produciendo el paquete — que es exactamente lo que este guion
  existe para impedir.
#>
function Invocar($descripcion, [scriptblock]$comando) {
  & $comando
  if ($LASTEXITCODE -ne 0) {
    throw "$descripcion falló (código $LASTEXITCODE). No se genera paquete."
  }
}

Write-Host "`nEmpaquetado del tablero ICONICS" -ForegroundColor White
Write-Host "raíz: $Raiz" -ForegroundColor DarkGray

# ── 1 · Banderas que no deben viajar al bundle ────────────────────────
Paso "Banderas de compilación"

foreach ($v in "VITE_ICONICS_FAKE", "VITE_ENABLE_DEMO") {
  if (Test-Path "env:$v") {
    throw @"
$v está definida en este entorno (valor: '$((Get-Item env:$v).Value)').

Esa variable se resuelve en COMPILACIÓN y quedaría horneada en el bundle:
el tablero enseñaría datos que no son de la planta y no habría forma de
notarlo mirando la pantalla.

Límpiala y vuelve a lanzar:    Remove-Item env:$v
"@
  }
}
Bien "sin VITE_ICONICS_FAKE ni VITE_ENABLE_DEMO"

# ── 2 · Versión ───────────────────────────────────────────────────────
Paso "Versión"

Push-Location $Raiz
try {
  $sucio = (git status --porcelain) -ne $null
  $version = (git describe --always --dirty --tags 2>$null)
  if (-not $version) { throw "No se pudo obtener la versión con git describe." }
  $version = $version.Trim()
} finally { Pop-Location }

if ($sucio -and -not $PermitirArbolSucio) {
  throw @"
El árbol de git tiene cambios sin confirmar, así que la versión sería
'$version' y no identificaría nada reproducible.

Confirma los cambios, o usa -PermitirArbolSucio si esto es un ensayo.
"@
}
if ($sucio) { Aviso "árbol sucio: la versión llevará el sufijo -dirty" }

# Sin etiquetas, `git describe` devuelve sólo el hash. Funciona, pero una
# etiqueta anotada da versiones que un humano puede citar por teléfono.
if ($version -notmatch '^v?\d') {
  Aviso "no hay etiquetas en el repositorio; la versión es sólo el hash"
  Aviso "considera:  git tag -a v1.0.0 -m 'Primera release de planta'"
}
Bien "versión: $version"

# ── 3 · Las dos suites ────────────────────────────────────────────────
if ($SaltarPruebas) {
  Paso "Pruebas"
  Aviso "SALTADAS por parámetro: este paquete NO está verificado"
} else {
  Paso "Contrato del backend"
  Push-Location $Raiz
  try { Invocar "verificar-backend.mjs" { node scripts/verificar-backend.mjs } }
  finally { Pop-Location }
  Bien "el contrato del backend se mantiene"

  Paso "Pruebas del frontend"
  Invocar "npm test" { npm --prefix (Join-Path $Raiz "react-dashboard") test }
  Bien "suite del frontend en verde"
}

# ── 4 · Compilación ───────────────────────────────────────────────────
Paso "Compilación del frontend"

$frontend = Join-Path $Raiz "react-dashboard"
# `npm ci` y no `npm install`: instala exactamente el lockfile y borra lo que
# hubiera antes. Una release no puede depender de lo que quedara en la
# máquina de quien la compila.
Invocar "npm ci" { npm --prefix $frontend ci }
Invocar "npm run build" { npm --prefix $frontend run build }

$dist = Join-Path $frontend "dist"
if (-not (Test-Path (Join-Path $dist "index.html"))) {
  throw "La compilación no produjo $dist\index.html."
}
Bien "bundle compilado"

# El bundle no debe contener las vistas de propuesta: si aparecen, la bandera
# se coló por otra vía (un .env.local del frontend, por ejemplo) y el paquete
# no es de planta.
$propuestas = @(Get-ChildItem (Join-Path $dist "assets") -Filter *.js |
  Where-Object { $_.Name -match 'Sandbox|DashboardV2|Area[12]|variants' })
if ($propuestas.Count -gt 0) {
  throw @"
El bundle contiene $($propuestas.Count) trozo(s) de las vistas de propuesta:
$($propuestas.Name -join ', ')

Eso significa que el modo demo se activó en la compilación. Revisa
react-dashboard\.env.local además de las variables de entorno.
"@
}
Bien "sin vistas de propuesta en el bundle"

# ── 5 · La carpeta de release ─────────────────────────────────────────
Paso "Paquete"

$destino = Join-Path $Salida $version
if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
New-Item -ItemType Directory -Force $destino | Out-Null

Copy-Item (Join-Path $Raiz "backend") (Join-Path $destino "backend") -Recurse
Copy-Item $dist (Join-Path $destino "public") -Recurse

$verificado = if ($SaltarPruebas) { "NO (pruebas saltadas)" } else { "sí" }
@"
$version
compilado : $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
maquina   : $env:COMPUTERNAME
verificado: $verificado
"@ | Set-Content (Join-Path $destino "VERSION") -Encoding UTF8

Copy-Item (Join-Path $PSScriptRoot "LEEME-RELEASE.txt") $destino -ErrorAction SilentlyContinue

$zip = Join-Path $Salida "dashboard-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $destino "*") -DestinationPath $zip

$mb = [Math]::Round((Get-Item $zip).Length / 1MB, 2)
Bien "carpeta: $destino"
Bien "zip:     $zip  ($mb MB)"

Write-Host "`nPaquete $version listo." -ForegroundColor Green
Write-Host "Siguiente: cópialo al servidor y lanza deploy\desplegar.ps1 allí.`n" -ForegroundColor DarkGray
