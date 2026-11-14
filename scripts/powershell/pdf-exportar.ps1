# Exporta cada pagina de um PDF como PNG pelo leitor de PDF do proprio Windows 10
# (Windows.Data.Pdf, o mesmo do Edge antigo): sem programa extra instalado.
#
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File pdf-exportar.ps1 -Arquivo <pdf> -Pasta <saida> -Largura 1920
#
# Grava <Pasta>\resultado.json em UTF-8, no mesmo formato do pptx-exportar.ps1:
#   { "ok": true, "largura": 1920, "altura": 1080, "slides": [ { "arquivo": "001.png", "id": 1, "oculto": false, "notas": "" } ] }
#   { "ok": false, "erro": "..." }
# e escreve "PROGRESSO i/n" na saida padrao a cada pagina. Arquivo so com ASCII (PowerShell 5.1).
param(
  [Parameter(Mandatory = $true)][string]$Arquivo,
  [Parameter(Mandatory = $true)][string]$Pasta,
  [int]$Largura = 1920
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
$saida = Join-Path $Pasta 'resultado.json'

function Gravar($obj) {
  [System.IO.File]::WriteAllText($saida, (ConvertTo-Json $obj -Depth 6 -Compress), $utf8)
}

try {
  if (-not (Test-Path -LiteralPath $Arquivo)) { throw "Arquivo nao encontrado: $Arquivo" }
  New-Item -ItemType Directory -Force -Path $Pasta | Out-Null

  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $metodos = [System.WindowsRuntimeSystemExtensions].GetMethods()
  $asTaskOp = $metodos | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
  $asTaskAcao = $metodos | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1

  function Esperar($operacao, [Type]$tipo) {
    $t = $asTaskOp.MakeGenericMethod($tipo).Invoke($null, @($operacao))
    [void]$t.Wait(-1)
    return $t.Result
  }
  function EsperarAcao($acao) {
    $t = $asTaskAcao.Invoke($null, @($acao))
    [void]$t.Wait(-1)
  }

  [void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
  [void][Windows.Storage.StorageFolder, Windows.Storage, ContentType = WindowsRuntime]
  [void][Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
  [void][Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
  [void][Windows.Data.Pdf.PdfPageRenderOptions, Windows.Data.Pdf, ContentType = WindowsRuntime]

  $caminho = (Resolve-Path -LiteralPath $Arquivo).ProviderPath
  $arq = Esperar ([Windows.Storage.StorageFile]::GetFileFromPathAsync($caminho)) ([Windows.Storage.StorageFile])
  try {
    $doc = Esperar ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($arq)) ([Windows.Data.Pdf.PdfDocument])
  } catch {
    throw 'PDF_ILEGIVEL'
  }
  $pastaWin = Esperar ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync((Resolve-Path -LiteralPath $Pasta).ProviderPath)) ([Windows.Storage.StorageFolder])

  $n = [int]$doc.PageCount
  $slides = New-Object System.Collections.ArrayList
  $alturaMax = 0
  for ($i = 0; $i -lt $n; $i++) {
    $pagina = $doc.GetPage([uint32]$i)
    $tam = $pagina.Size
    $altura = [int][Math]::Round($Largura * $tam.Height / $tam.Width)
    if ($altura -gt $alturaMax) { $alturaMax = $altura }
    $opcoes = New-Object Windows.Data.Pdf.PdfPageRenderOptions
    $opcoes.DestinationWidth = [uint32]$Largura
    $opcoes.DestinationHeight = [uint32]$altura
    $nome = '{0:D3}.png' -f ($i + 1)
    $destino = Esperar ($pastaWin.CreateFileAsync($nome, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
    $fluxo = Esperar ($destino.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) ([Windows.Storage.Streams.IRandomAccessStream])
    try {
      # sem BitmapEncoderId o Windows grava PNG
      EsperarAcao ($pagina.RenderToStreamAsync($fluxo, $opcoes))
    } finally {
      $fluxo.Dispose()
      $pagina.Dispose()
    }
    [void]$slides.Add([pscustomobject]@{ arquivo = $nome; id = $i + 1; oculto = $false; notas = '' })
    [Console]::Out.WriteLine("PROGRESSO $($i + 1)/$n")
    [Console]::Out.Flush()
  }

  $primeira = if ($slides.Count -gt 0) { $alturaMax } else { 0 }
  Gravar ([pscustomobject]@{ ok = $true; largura = $Largura; altura = $primeira; slides = $slides.ToArray() })
} catch {
  $msg = $_.Exception.Message
  if ($_.Exception.InnerException) { $msg = $_.Exception.InnerException.Message }
  try { Gravar ([pscustomobject]@{ ok = $false; erro = $msg }) } catch {}
  [Console]::Error.WriteLine($msg)
  exit 1
}
exit 0
