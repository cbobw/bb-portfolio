# 執行 Bingle Portfolio PDF 產生器（Windows）
# 用法：在專案根目錄或本資料夾執行 .\pdf-generator\run.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
$Script = Join-Path $Root "generate.py"

# WeasyPrint 需要 GTK3 runtime（libgobject 等）
$GtkCandidates = @(
    "C:\Program Files\GTK3-Runtime Win64\bin",
    "C:\GTK3-Runtime Win64\bin"
)
$GtkBin = $GtkCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($GtkBin) {
    $env:Path = "$GtkBin;$env:Path"
    Write-Host "[info] GTK PATH: $GtkBin"
} else {
    Write-Warning "未偵測到 GTK3 Runtime。若匯入失敗，請安裝：winget install tschoonj.GTKForWindows"
}

if (-not (Test-Path $VenvPython)) {
    Write-Host "[setup] 建立虛擬環境並安裝依賴..."
    $Py = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
    if (-not (Test-Path $Py)) { $Py = "python" }
    & $Py -m venv (Join-Path $Root ".venv")
    & (Join-Path $Root ".venv\Scripts\pip.exe") install -r (Join-Path $Root "requirements.txt")
}

& $VenvPython $Script @args
