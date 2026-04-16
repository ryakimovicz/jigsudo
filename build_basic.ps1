# Jigsudo Basic Edition Build Script
# usage: ./build_basic.ps1

$projectName = "jigsudo-basic-edition"
$distFolder = "dist_basic"
$zipFile = "$projectName.zip"

Write-Host "Starting Build for $projectName..." -ForegroundColor Cyan

# 1. Cleanup
if (Test-Path $distFolder) { Remove-Item -Recurse -Force $distFolder }
if (Test-Path $zipFile) { Remove-Item $zipFile }

# 2. Create folder structure
New-Item -ItemType Directory -Path $distFolder
New-Item -ItemType Directory -Path "$distFolder/js"
New-Item -ItemType Directory -Path "$distFolder/css"
New-Item -ItemType Directory -Path "$distFolder/assets"
New-Item -ItemType Directory -Path "$distFolder/public"
New-Item -ItemType Directory -Path "$distFolder/public/puzzles"
New-Item -ItemType Directory -Path "$distFolder/about"

# 3. Copy files
Write-Host "Copying core files..."
Copy-Item "index.html" "$distFolder/"
Copy-Item -Recurse "css" "$distFolder/" -Force
Copy-Item -Recurse "js" "$distFolder/" -Force
Copy-Item -Recurse "assets" "$distFolder/" -Force
Copy-Item -Recurse "about" "$distFolder/" -Force

# 4. Copy ONLY the fixed puzzle and index
Write-Host "Preparing limited puzzle data (2026-04-15 only)..."
Copy-Item "public/puzzles/daily-2026-04-15.json" "$distFolder/public/puzzles/" -Force
# Create a dummy index.json with only one entry
'["2026-04-15"]' | Out-File -FilePath "$distFolder/public/puzzles/index.json" -Encoding utf8

# 4.1 Force fallback board_data to match 15/04 for total consistency
Copy-Item "public/puzzles/daily-2026-04-15.json" "$distFolder/js/board_data.json" -Force

# 5. Build Preparation
Write-Host "Cleaning up build logic (keeping files)..."
# We no longer delete files or purge HTML to maintain 100% stability.
# All UI transformations are handled via CSS/JS in basic-edition.js.

# 6. Compress
Write-Host "Creating ZIP: $zipFile..." -ForegroundColor Yellow
Compress-Archive -Path "$distFolder/*" -DestinationPath $zipFile

Write-Host "Build Complete! File: $zipFile" -ForegroundColor Green
