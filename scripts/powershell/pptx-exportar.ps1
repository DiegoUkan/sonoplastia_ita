# Exporta cada slide de um .pptx/.ppsx como PNG pelo PowerPoint instalado (COM, sem janela),
# junto com as anotacoes do orador e se o slide esta oculto.
#
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File pptx-exportar.ps1 -Arquivo <pptx> -Pasta <saida> -Largura 1920
#
# Grava <Pasta>\resultado.json em UTF-8:
#   { "ok": true, "largura": 1920, "altura": 1080, "slides": [ { "arquivo": "001.png", "id": 256, "oculto": false, "notas": "..." } ] }
#   { "ok": false, "erro": "..." }
# e escreve "PROGRESSO i/n" na saida padrao a cada slide.
#
# Cuidados: se o PowerPoint ja estava aberto (o operador usando), so fecha a apresentacao que abriu;
# nunca fecha o PowerPoint de quem estava usando. O arquivo deste script fica so com ASCII porque o
# Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.
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

$estavaAberto = $null -ne (Get-Process POWERPNT -ErrorAction SilentlyContinue)
$app = $null
$pres = $null
try {
  if (-not (Test-Path -LiteralPath $Arquivo)) { throw "Arquivo nao encontrado: $Arquivo" }
  New-Item -ItemType Directory -Force -Path $Pasta | Out-Null
  # arquivo baixado da internet abre em "modo protegido"; a copia da biblioteca pode ser liberada
  try { Unblock-File -LiteralPath $Arquivo } catch {}

  try {
    $app = New-Object -ComObject PowerPoint.Application
  } catch {
    throw 'POWERPOINT_AUSENTE'
  }
  # Open(FileName, ReadOnly = msoTrue, Untitled = msoFalse, WithWindow = msoFalse)
  $pres = $app.Presentations.Open($Arquivo, -1, 0, 0)

  $lw = [double]$pres.PageSetup.SlideWidth
  $lh = [double]$pres.PageSetup.SlideHeight
  $altura = [int][Math]::Round($Largura * $lh / $lw)
  $n = $pres.Slides.Count
  $slides = New-Object System.Collections.ArrayList

  for ($i = 1; $i -le $n; $i++) {
    $s = $pres.Slides.Item($i)
    $nome = '{0:D3}.png' -f $i
    $s.Export((Join-Path $Pasta $nome), 'PNG', $Largura, $altura)

    $notas = ''
    try {
      foreach ($sh in $s.NotesPage.Shapes) {
        # 14 = msoPlaceholder; 2 = ppPlaceholderBody (o texto das anotacoes)
        if ($sh.Type -eq 14 -and $sh.PlaceholderFormat.Type -eq 2 -and $sh.HasTextFrame) {
          $notas = [string]$sh.TextFrame.TextRange.Text
          break
        }
      }
    } catch {}

    $oculto = $false
    try { $oculto = ($s.SlideShowTransition.Hidden -eq -1) } catch {}

    [void]$slides.Add([pscustomobject]@{ arquivo = $nome; id = [int]$s.SlideID; oculto = $oculto; notas = $notas })
    [Console]::Out.WriteLine("PROGRESSO $i/$n")
    [Console]::Out.Flush()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($s)
  }

  Gravar ([pscustomobject]@{ ok = $true; largura = $Largura; altura = $altura; slides = $slides.ToArray() })
} catch {
  $msg = $_.Exception.Message
  try { Gravar ([pscustomobject]@{ ok = $false; erro = $msg }) } catch {}
  [Console]::Error.WriteLine($msg)
  exit 1
} finally {
  if ($pres) { try { $pres.Close() } catch {} }
  if ($app -and -not $estavaAberto) {
    try { if ($app.Presentations.Count -eq 0) { $app.Quit() } } catch {}
  }
  if ($pres) { try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) } catch {} }
  if ($app) { try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) } catch {} }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
exit 0
