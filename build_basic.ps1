# Jigsudo Basic Edition Build Script (Universal Forward-Slash Fix)
# usage: ./build_basic.ps1

$projectName = "jigsudo-basic-edition"
$distFolder = "dist_basic"
$zipFile = "$projectName.zip"

Write-Host "Starting Build for $projectName..." -ForegroundColor Cyan

# 1. Cleanup
if (Test-Path $distFolder) { Remove-Item -Recurse -Force $distFolder }
if (Test-Path $zipFile) { Remove-Item $zipFile }

# 2. Create folder structure
New-Item -ItemType Directory -Path $distFolder -Force
New-Item -ItemType Directory -Path "$distFolder/js" -Force
New-Item -ItemType Directory -Path "$distFolder/css" -Force
New-Item -ItemType Directory -Path "$distFolder/assets" -Force
New-Item -ItemType Directory -Path "$distFolder/public" -Force
New-Item -ItemType Directory -Path "$distFolder/public/puzzles" -Force
New-Item -ItemType Directory -Path "$distFolder/about" -Force

# 3. Copy files
Write-Host "Copying core files..."
Copy-Item "index.html" "$distFolder/"
Copy-Item -Recurse "css/*" "$distFolder/css/" -Force
Copy-Item -Recurse "js/*" "$distFolder/js/" -Force
Copy-Item -Recurse "assets/*" "$distFolder/assets/" -Force
Copy-Item -Recurse "about/*" "$distFolder/about/" -Force

# 4. Copy ONLY the fixed puzzle and index
Write-Host "Preparing limited puzzle data (2026-04-15 only)..."
Copy-Item "public/puzzles/daily-2026-04-15.json" "$distFolder/public/puzzles/" -Force
# Create a dummy index.json with only one entry
'["2026-04-15"]' | Out-File -FilePath "$distFolder/public/puzzles/index.json" -Encoding utf8

# 4.1 Force fallback board_data to match 15/04 as an ES module for total consistency and cross-origin safety
$jsonText = Get-Content "public/puzzles/daily-2026-04-15.json" -Raw
$jsText = "export default " + $jsonText + ";"
$jsText | Out-File -FilePath "$distFolder/js/board_data.js" -Encoding utf8

# 5. Build Preparation
Write-Host "Cleaning up build logic..."

# 6. Manual ZIP Creation with Forward Slashes
Write-Host "Creating ZIP (Forcing Forward Slashes for itch.io)..." -ForegroundColor Yellow
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipFilePath = Join-Path (Get-Location) $zipFile
$zipArchive = [System.IO.Compression.ZipFile]::Open($zipFilePath, "Update")

$files = Get-ChildItem -Path $distFolder -Recurse | Where-Object { ! $_.PSIsContainer }

foreach ($file in $files) {
    $relativePath = $file.FullName.Substring((Get-Item $distFolder).FullName.Length + 1)
    # FORCE FORWARD SLASHES
    $universalPath = $relativePath.Replace("\", "/")
    
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipArchive, $file.FullName, $universalPath)
}

$zipArchive.Dispose()

Write-Host "Build Complete! File: $zipFile" -ForegroundColor Green
