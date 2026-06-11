# Whale Play one-click setup + launch
# Requires: Windows 10+, admin for Node.js MSI install
$ErrorActionPreference = "Continue"
$root = $PSScriptRoot

Write-Host ""
Write-Host "  ============================================================"  -ForegroundColor Cyan
Write-Host "      Whale Play"                                              -ForegroundColor Cyan
Write-Host "  ============================================================"  -ForegroundColor Cyan
Write-Host ""

$rustOk = $false

# ── Step 1: Node.js ───────────────────────────────────
Write-Host "  [1/4] Node.js" -ForegroundColor Yellow
$node = Get-Command node -ErrorAction SilentlyContinue
$needNodeInstall = $true
if ($node) {
  $v = (node -v) -replace 'v',''
  $major = [int]$v.Split('.')[0]
  if ($major -ge 22) {
    Write-Host "  [OK]  Node.js v$v (v$major is supported)" -ForegroundColor Green
    $needNodeInstall = $false
  } else {
    Write-Host "  [WARN] Node.js v$v is too old. Need v22+." -ForegroundColor DarkYellow
  }
}
if ($needNodeInstall) {
  Write-Host "  Downloading Node.js 24 LTS ..."
  # Use latest-v24.x redirect so it always grabs the newest v24
  $url = (Invoke-WebRequest -Uri "https://nodejs.org/dist/latest-v24.x/" -UseBasicParsing).Links `
    | Where-Object { $_.href -match 'node-v[\d.]+-x64\.msi$' } `
    | Select-Object -First 1 -ExpandProperty href
  if (-not $url) {
    # Fallback to fixed version if parsing fails
    $url = "https://nodejs.org/dist/v24.16.0/node-v24.16.0-x64.msi"
  } elseif ($url -notlike 'http*') {
    $url = "https://nodejs.org/dist/latest-v24.x/$url"
  }
  $msi = "$env:TEMP\node-neo.msi"
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing
    Write-Host "  Installing (silent, may need admin rights)..."
    Start-Process msiexec.exe -ArgumentList "/i \"$msi\" /quiet /norestart" -Wait
    Remove-Item $msi -Force
    # Refresh PATH so this script can use node/pnpm immediately
    $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
    Write-Host "  [OK]  Node.js installed, continuing setup..." -ForegroundColor Green
  } catch {
    Write-Host "  [FAIL] Node.js download/install failed. Install manually: https://nodejs.org" -ForegroundColor Red
    exit 1
  }
}

# ── Step 2: pnpm ─────────────────────────────────────
Write-Host ""
Write-Host "  [2/4] pnpm" -ForegroundColor Yellow
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  Write-Host "  [OK]  pnpm $(pnpm -v)" -ForegroundColor Green
} else {
  Write-Host "  Installing pnpm via corepack..."
  corepack enable 2>$null
  corepack prepare pnpm@latest --activate 2>$null
  # Re-check after install
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    Write-Host "  [OK]  pnpm $(pnpm -v)" -ForegroundColor Green
  } else {
    Write-Host "  [FAIL] pnpm install failed" -ForegroundColor Red
    exit 1
  }
}

# ── Step 3: Rust (optional) ──────────────────────────
Write-Host ""
Write-Host "  [3/4] Rust (optional, needed for desktop build)" -ForegroundColor Yellow
if (Get-Command rustc -ErrorAction SilentlyContinue) {
  Write-Host "  [OK]  Rust $(rustc -V)" -ForegroundColor Green
  # Verify MSVC linker is available (common pitfall on Windows)
  $linkerOk = & rustc --print sysroot 2>&1 | Out-Null; $?
  if (-not (Get-Command link.exe -ErrorAction SilentlyContinue) -and -not $linkerOk) {
    Write-Host "  [WARN] MSVC linker not found. Install Visual Studio Build Tools:" -ForegroundColor DarkYellow
    Write-Host "         https://visualstudio.microsoft.com/visual-cpp-build-tools/" -ForegroundColor DarkYellow
    Write-Host "         Or install via winget: winget install "Microsoft.VisualStudio.2022.BuildTools"" -ForegroundColor DarkYellow
    Write-Host "         Then run 'pnpm tauri dev' manually after setup." -ForegroundColor DarkYellow
  }
  $rustOk = $true
} else {
  Write-Host "  Downloading Rust..."
  $rustUrl = "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe"
  $rustExe = "$env:TEMP\rustup-init.exe"
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $rustUrl -OutFile $rustExe -UseBasicParsing
    & $rustExe -y --default-toolchain stable
    Remove-Item $rustExe -Force
    $env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
    if (Get-Command rustc -ErrorAction SilentlyContinue) {
      Write-Host "  [OK]  Rust installed" -ForegroundColor Green
      Write-Host "  [INFO] If cargo build fails, install VS Build Tools (see warning above)." -ForegroundColor DarkYellow
      $rustOk = $true
    } else {
      Write-Host "  [WARN] 'rustc' not found after install. Restart terminal and rerun." -ForegroundColor DarkYellow
    }
  } catch {
    Write-Host "  [WARN] Rust download failed — browser mode still works." -ForegroundColor DarkYellow
    Write-Host "         Install manually: https://rustup.rs" -ForegroundColor DarkYellow
  }
}

# ── Step 4: Project dependencies ─────────────────────
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

# ── Launch ───────────────────────────────────────────
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Cyan
if ($rustOk) {
  Write-Host "    Starting Tauri desktop app ..." -ForegroundColor Green
  Write-Host "  ============================================================" -ForegroundColor Cyan
  pnpm tauri dev
} else {
  Write-Host "    Rust not available, starting browser mode ..." -ForegroundColor DarkYellow
  Write-Host "    If you want the desktop app later:" -ForegroundColor DarkYellow
  Write-Host "      1. Install Rust: https://rustup.rs" -ForegroundColor DarkYellow
  Write-Host "      2. Install VS Build Tools: https://visualstudio.microsoft.com/visual-cpp-build-tools/" -ForegroundColor DarkYellow
  Write-Host "      3. Run: pnpm tauri dev" -ForegroundColor DarkYellow
  Write-Host "  ============================================================" -ForegroundColor Cyan
  Start-Process "http://localhost:1420"
  pnpm dev
}

Pop-Location
