# Renderiza las páginas de un PDF a PNG con la API WinRT de Windows (sin instalar nada).
param([string]$Pdf, [string]$Salida, [int]$Max = 12)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFolder, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]

$metodos = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 }
$asTaskOp = $metodos | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
$asTaskAction = $metodos | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1

function Await($op, $tipo) {
  $t = $asTaskOp.MakeGenericMethod($tipo).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  return $t.Result
}
function AwaitAction($op) {
  $t = $asTaskAction.Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
}

if (-not (Test-Path $Salida)) { New-Item -ItemType Directory -Path $Salida | Out-Null }
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $Pdf).Path)) ([Windows.Storage.StorageFile])
$doc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
$carpeta = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync((Resolve-Path $Salida).Path)) ([Windows.Storage.StorageFolder])
$n = [Math]::Min([int]$doc.PageCount, $Max)
$base = [IO.Path]::GetFileNameWithoutExtension($Pdf)
for ($i = 0; $i -lt $n; $i++) {
  $page = $doc.GetPage($i)
  $nombre = "{0}-p{1:D2}.png" -f $base, ($i + 1)
  $out = Await ($carpeta.CreateFileAsync($nombre, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
  $stream = Await ($out.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) ([Windows.Storage.Streams.IRandomAccessStream])
  $opts = New-Object Windows.Data.Pdf.PdfPageRenderOptions
  $opts.DestinationWidth = 1240
  AwaitAction ($page.RenderToStreamAsync($stream, $opts))
  $stream.Dispose()
  $page.Dispose()
  Write-Output "$nombre"
}
Write-Output "paginas: $($doc.PageCount)"
