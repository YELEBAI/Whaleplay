# NeoTavern one-click setup + launch
$ErrorActionPreference = "Continue"
$root = $PSScriptRoot

Write-Host ""
Write-Host "  ============================================================"  -ForegroundColor Cyan
Write-Host "      NeoTavern"                                               -ForegroundColor Cyan
Write-Host "  ============================================================"  -ForegroundColor Cyan
Write-Host ""

$rustOk = $false

Write-Host "  [1/4] Node.js" -ForegroundColor Yellow
$node = Get-Command node -ErrorAction SilentlyContinue
$needInstall = $true
if ($node) {
  $v = (node -v) -replace 'v',''
  $major = [int]$v.Split('.')[0]
  if ($major -ge 18) {
    Write-Host "  [OK]  Node.js v$v" -ForegroundColor Green
    $needInstall = $false
  }
}
if ($needInstall) {
  Write-Host "  Downloading Node.js v20 LTS ..."
  $url = "https://nodejs.org/dist/v20.18.1/node-v20.18.1-x64.msi"
  $msi = "$env:TEMP\node-neo.msi"
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing
    Write-Host "  Installing (silent) ..."
    Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /quiet /norestart" -Wait
    Remove-Item $msi -Force
    $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
    Write-Host "  [OK]  Node.js installed. Please re-run this script." -ForegroundColor Green
    exit 0
  } catch {
    Write-Host "  [FAIL] Node.js download failed. Install manually: https://nodejs.org" -ForegroundColor Red
    exit 1
  }
}

Write-Host ""
Write-Host "  [2/4] pnpm" -ForegroundColor Yellow
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  Write-Host "  [OK]  pnpm $(pnpm -v)" -ForegroundColor Green
} else {
  Write-Host "  Installing pnpm ..."
  npm install -g pnpm 2>$null
  if ($LASTEXITCODE -ne 0) { corepack enable 2>$null; corepack prepare pnpm@latest --activate 2>$null }
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    Write-Host "  [OK]  pnpm installed" -ForegroundColor Green
  } else {
    Write-Host "  [FAIL] pnpm install failed" -ForegroundColor Red
    exit 1
  }
}

Write-Host ""
Write-Host "  [3/4] Rust (optional)" -ForegroundColor Yellow
if (Get-Command rustc -ErrorAction SilentlyContinue) {
  Write-Host "  [OK]  Rust $(rustc -V)" -ForegroundColor Green
  $rustOk = $true
} else {
  Write-Host "  Downloading Rust ..."
  $rustUrl = "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe"
  $rustExe = "$env:TEMP\rustup-init.exe"
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $rustUrl -OutFile $rustExe -UseBasicParsing
    & $rustExe -y --default-toolchain stable
    Remove-Item $rustExe -Force
    $env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
    if (Get-Command rustc -ErrorAction SilentlyContinue) {
      $rustOk = $true
      Write-Host "  [OK]  Rust installed" -ForegroundColor Green
    } else {
      Write-Host "  [WARN] Rust may need terminal restart" -ForegroundColor DarkYellow
    }
  } catch {
    Write-Host "  [WARN] Rust download failed - browser mode still works" -ForegroundColor DarkYellow
  }
}

Write-Host ""
Write-Host "  [4/4] Project dependencies" -ForegroundColor Yellow
Push-Location $root
pnpm install
if ($LASTEXITCODE -ne 0) {
  Write-Host "  [FAIL] Dependencies install failed" -ForegroundColor Red
  Pop-Location
  exit 1
}
Write-Host "  [OK]  Dependencies ready" -ForegroundColor Green

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Cyan
if ($rustOk) {
  Write-Host "    Starting Tauri desktop app ..." -ForegroundColor Green
  Write-Host "  ============================================================" -ForegroundColor Cyan
  pnpm tauri dev
} else {
  Write-Host "    Rust not installed, starting browser mode ..." -ForegroundColor DarkYellow
  Write-Host "  ============================================================" -ForegroundColor Cyan
  Start-Process "http://localhost:1420"
  pnpm dev
}

Pop-Location
