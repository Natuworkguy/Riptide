#Requires -Version 5.1
<#
    Riptide installer for Windows (PowerShell).

      irm https://raw.githubusercontent.com/Natuworkguy/Riptide/main/install.ps1 | iex
      .\install.ps1 -Dev          the dev branch, where changes land before a release
      .\install.ps1 -Uninstall    take it back out
      & ([scriptblock]::Create((irm https://raw.githubusercontent.com/Natuworkguy/Riptide/dev/install.ps1))) -Dev

    Installs Riptide into %LOCALAPPDATA%\Riptide with a Python environment of its own, adds a `riptide` command and a
    Start menu shortcut, and registers riptide://open links. Running it again updates.
#>

param(
    [switch]$Dev,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$Repo = "Natuworkguy/Riptide"
$Home_ = Join-Path $env:LOCALAPPDATA "Riptide"
$App = Join-Path $Home_ "app"
$Venv = Join-Path $Home_ "venv"
$Bin = Join-Path $Home_ "bin"
$Python = Join-Path $Venv "Scripts\python.exe"
$PythonW = Join-Path $Venv "Scripts\pythonw.exe"
$Shortcut = Join-Path ([Environment]::GetFolderPath("Programs")) "Riptide.lnk"
$SchemeKey = "HKCU:\Software\Classes\riptide"
$Branch = if ($Dev) { "dev" } else { "main" }

function Remove-FromPath([string]$Dir) {
    $path = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($path) {
        $kept = ($path -split ";" | Where-Object { $_ -and ($_.TrimEnd("\") -ne $Dir.TrimEnd("\")) }) -join ";"
        [Environment]::SetEnvironmentVariable("Path", $kept, "User")
    }
}

function Uninstall-Riptide {
    Write-Host "Uninstalling Riptide..."
    if ((Test-Path $Python) -and (Test-Path (Join-Path $App "launch.py"))) {
        & $Python (Join-Path $App "launch.py") --stop | Out-Null
    }
    Remove-Item -Recurse -Force $SchemeKey -ErrorAction SilentlyContinue
    Remove-Item -Force $Shortcut -ErrorAction SilentlyContinue
    Remove-FromPath $Bin
    Remove-Item -Recurse -Force $Home_ -ErrorAction SilentlyContinue
    Write-Host "Riptide is uninstalled. Your projects (.rip files) are where you saved them, untouched."
}

if ($Uninstall) {
    Uninstall-Riptide
    exit 0
}

# ---------- Python ----------
$SystemPython = $null
foreach ($line in @("py -3", "python", "python3")) {
    $parts = @($line -split " ")
    $exe = $parts[0]
    if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { continue }
    $rest = @($parts | Select-Object -Skip 1)
    # the Store's python.exe stub opens the Store instead of running: a failed probe just moves on
    try { & $exe @rest -c "import sys; sys.exit(sys.version_info < (3, 10))" *> $null } catch { continue }
    if ($LASTEXITCODE -eq 0) { $SystemPython = $parts; break }
}
if (-not $SystemPython) {
    Write-Host "Riptide needs Python 3.10 or newer. Install it from https://www.python.org/downloads/ (or: winget install Python.Python.3.12) and run this again."
    exit 1
}

# ---------- the code ----------
if ($Dev) { Write-Host "Installing the dev version of Riptide." } else { Write-Host "Installing Riptide." }
New-Item -ItemType Directory -Force -Path $Home_ | Out-Null
if (Get-Command git -ErrorAction SilentlyContinue) {
    if (Test-Path (Join-Path $App ".git")) {
        git -C $App fetch --depth 1 origin $Branch
        git -C $App checkout -q -B $Branch FETCH_HEAD
        git -C $App reset -q --hard FETCH_HEAD
    } else {
        Remove-Item -Recurse -Force $App -ErrorAction SilentlyContinue
        git clone -q --depth 1 --branch $Branch "https://github.com/$Repo.git" $App
    }
    if ($LASTEXITCODE -ne 0) { Write-Host "Could not download Riptide. Check your connection and try again."; exit 1 }
} else {
    $Zip = Join-Path ([System.IO.Path]::GetTempPath()) ("riptide-" + [System.Guid]::NewGuid().ToString("N") + ".zip")
    $Out = $Zip + ".d"
    Invoke-WebRequest -UseBasicParsing "https://github.com/$Repo/archive/refs/heads/$Branch.zip" -OutFile $Zip
    Expand-Archive -Path $Zip -DestinationPath $Out -Force
    Remove-Item -Recurse -Force $App -ErrorAction SilentlyContinue
    Move-Item (Get-ChildItem $Out | Select-Object -First 1).FullName $App
    Remove-Item -Recurse -Force $Zip, $Out -ErrorAction SilentlyContinue
}

# ---------- the setup window, from here on ----------
# While it is open, the steps show there and the terminal stays quiet.
$Quiet = $false
function Set-Step([int]$Index, [string]$State, [string]$Note = "") { if ($Quiet) { Set-SetupStep $Index $State $Note } }
function Say([string]$Text) { if (-not $Quiet) { Write-Host $Text } }
function Stop-Here([string]$Text) {
    if ($Quiet) { Stop-SetupWindow $Text }
    Write-Host $Text
    exit 1
}
$WindowKit = Join-Path $App "installer\window\window.ps1"
if ((-not [Console]::IsOutputRedirected) -and (Test-Path $WindowKit)) {
    . $WindowKit
    $exe = (Get-Command $SystemPython[0]).Source
    if ($SystemPython[0] -eq "py") { $exe = (& py -3 -c "import sys; print(sys.executable)").Trim() }
    if (Open-SetupWindow "Riptide" "#6aa8ff" $exe @("Getting Riptide", "Riptide's Python packages", "The riptide command", "The Start menu", "riptide:// links")) {
        Set-SetupStep 0 "ok" $Branch
        $Quiet = $true
        Write-Host "Riptide is setting up in its own window. Leave this terminal open until it's done."
    }
}

# ---------- its Python environment ----------
Set-Step 1 "run"
Say "Setting up Riptide's Python environment..."
if (-not (Test-Path $Python)) {
    $exe = $SystemPython[0]; $rest = @($SystemPython | Select-Object -Skip 1)
    & $exe @rest -m venv $Venv
}
& $Python -m pip install -q --upgrade pip
& $Python -m pip install -q -r (Join-Path $App "requirements.txt")
if ($LASTEXITCODE -ne 0) { Stop-Here "Could not install Riptide's Python packages." }
Set-Step 1 "ok"
Set-Step 2 "run"

# ---------- the riptide command ----------
New-Item -ItemType Directory -Force -Path $Bin | Out-Null
Set-Content -Path (Join-Path $Bin "riptide.cmd") -Encoding ASCII -Value "@`"$Python`" `"$App\launch.py`" %*"
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not (($UserPath -split ";") -contains $Bin)) {
    [Environment]::SetEnvironmentVariable("Path", (($UserPath, $Bin) | Where-Object { $_ }) -join ";", "User")
}

Set-Step 2 "ok"

# ---------- the Start menu ----------
Set-Step 3 "run"
$Shell = New-Object -ComObject WScript.Shell
$Link = $Shell.CreateShortcut($Shortcut)
$Link.TargetPath = $PythonW
$Link.Arguments = "`"$App\launch.py`""
$Link.WorkingDirectory = $App
$Link.Description = "Riptide: video, motion graphics and 3D editor"
# its icon, made from the logo with what every Windows has
try {
    Add-Type -AssemblyName System.Drawing
    $Png = Join-Path $App "brand\riptide-icon-512.png"
    $Ico = Join-Path $Home_ "riptide.ico"
    $Bitmap = New-Object System.Drawing.Bitmap((New-Object System.Drawing.Bitmap($Png)), 256, 256)
    $Icon = [System.Drawing.Icon]::FromHandle($Bitmap.GetHicon())
    $Stream = [System.IO.File]::Create($Ico); $Icon.Save($Stream); $Stream.Close()
    $Link.IconLocation = "$Ico,0"
} catch { }
$Link.Save()
Set-Step 3 "ok"
Set-Step 4 "run"

# ---------- riptide:// links ----------
New-Item -Force -Path $SchemeKey | Out-Null
Set-ItemProperty -Path $SchemeKey -Name "(Default)" -Value "URL:Riptide Protocol"
Set-ItemProperty -Path $SchemeKey -Name "URL Protocol" -Value ""
New-Item -Force -Path "$SchemeKey\shell\open\command" | Out-Null
Set-ItemProperty -Path "$SchemeKey\shell\open\command" -Name "(Default)" -Value "`"$PythonW`" `"$App\launch.py`" `"%1`""

Set-Step 4 "ok"

# ---------- what is still missing ----------
if ($Quiet) {
    $note = if (Get-Command ffmpeg -ErrorAction SilentlyContinue) { "Open it from the Start menu, or type riptide in a new terminal." } `
            else { "Install ffmpeg for MP4, WebM and GIF export (winget install Gyan.FFmpeg). Open Riptide from the Start menu." }
    Complete-SetupWindow $note @($PythonW, (Join-Path $App "launch.py"))
    Write-Host "Riptide is installed ($Branch). Open it from the Start menu, or run: riptide"
    exit 0
}
Write-Host ""
Write-Host "Riptide is installed ($Branch)."
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Host "ffmpeg is not installed: MP4, WebM and GIF export need it (stills and PNG sequences do not)."
    Write-Host "  Install it with: winget install Gyan.FFmpeg"
}
Write-Host "Open it from the Start menu, with a riptide://open link, or by running riptide in a new terminal."
