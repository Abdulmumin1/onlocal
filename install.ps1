$ErrorActionPreference = "Stop"

$REPO = "Abdulmumin1/onlocal"
$INSTALL_DIR = "$env:USERPROFILE\.onlocal\bin"

# Colors
function Write-Green { param($text) Write-Host $text -ForegroundColor Green }
function Write-Red { param($text) Write-Host $text -ForegroundColor Red }
function Write-Muted { param($text) Write-Host $text -ForegroundColor Gray }

# Detect Architecture
$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -eq "AMD64") {
    $arch = "x64"
} elseif ($arch -eq "ARM64") {
    $arch = "arm64"
} else {
    Write-Red "Unsupported architecture: $arch"
    exit 1
}

$filename = "onlocal-windows-${arch}.exe"
Write-Muted "Detected: windows-${arch}"

# Get Latest Version
Write-Muted "Fetching latest version..."
try {
    # Use Invoke-WebRequest with Head method to follow redirects and get the final URL
    $response = Invoke-WebRequest -Uri "https://github.com/$REPO/releases/latest" -Method Head -MaximumRedirection 0 -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 302) {
        $latestUrl = $response.Headers["Location"]
    } else {
         # Fallback or error
         throw "Could not determine latest release"
    }
} catch {
    # Try alternate method via API if the head request fails (e.g. rate limits or network issues)
    try {
       $latestRelease = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO/releases/latest"
       $latestTag = $latestRelease.tag_name
    } catch {
       Write-Red "Failed to fetch latest version."
       exit 1
    }
}

if (-not $latestTag) {
    if ($latestUrl) {
        $latestTag = $latestUrl | Split-Path -Leaf
    } else {
        Write-Red "Could not determine latest tag."
        exit 1
    }
}

Write-Muted "Installing version: $latestTag"

# Download
$url = "https://github.com/$REPO/releases/download/$latestTag/$filename"
$destDir = $INSTALL_DIR
$dest = "$destDir\onlocal.exe"

if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
}

Write-Muted "Downloading..."
try {
    Invoke-WebRequest -Uri $url -OutFile $dest
} catch {
    Write-Red "Download failed from $url"
    Write-Red "Please check if the release exists for your architecture."
    exit 1
}

# Add to PATH
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$INSTALL_DIR*") {
    $newPath = "$userPath;$INSTALL_DIR"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Muted "Added to User PATH."
}

Write-Host ""
Write-Green "onlocal installed successfully!"
Write-Host ""
Write-Muted "To get started:"
Write-Muted "1. Restart your terminal."
Write-Muted "2. Run: onlocal"
Write-Host ""
