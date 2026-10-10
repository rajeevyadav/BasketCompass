# Build the downloadable BasketCompass Windows installer end to end:
# run the tests, (re)generate icons, freeze the launcher with PyInstaller, then
# wrap it with Inno Setup. Produces dist-installer\BasketCompass-Setup-<ver>-Windows-x64.exe.
#
# Requirements on the build machine: Node.js, Python 3.11-3.13, and Inno Setup 6
# (ISCC.exe). The app itself stays dependency-free; these are build-time only.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$version = '0.1.0'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required to run the tests.' }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Python 3.11-3.13 is required.' }

Write-Host '== Tests ==' -ForegroundColor Cyan
npm test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed; not building.' }

Write-Host '== Brand assets ==' -ForegroundColor Cyan
python brand\GenerateBrand.py

Write-Host '== Build environment ==' -ForegroundColor Cyan
python -m venv .build-venv
& .\.build-venv\Scripts\python -m pip install --require-virtualenv --upgrade pip
& .\.build-venv\Scripts\python -m pip install --require-virtualenv pyinstaller pillow

Write-Host '== Freeze launcher (PyInstaller) ==' -ForegroundColor Cyan
# Output to dist-app and build-work so the web app's dist/ folder is never touched.
& .\.build-venv\Scripts\pyinstaller --clean --noconfirm --distpath dist-app --workpath build-work build\BasketCompass.spec

Write-Host '== Installer (Inno Setup) ==' -ForegroundColor Cyan
$iscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue
if (-not $iscc) {
    $candidate = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
    if (Test-Path $candidate) { $iscc = Get-Command $candidate }
}
if (-not $iscc) { throw 'Inno Setup 6 is required; ISCC.exe was not found on PATH or in Program Files.' }
& $iscc.Source build\BasketCompass.iss

$setup = "dist-installer\BasketCompass-Setup-$version-Windows-x64.exe"
Write-Host "== Done ==" -ForegroundColor Green
Get-FileHash $setup -Algorithm SHA256 | Format-List
