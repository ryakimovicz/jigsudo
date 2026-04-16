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

# 3. Copy files
Write-Host "Copying core files..."
Copy-Item "index.html" "$distFolder/"
Copy-Item -Recurse "css" "$distFolder/"
Copy-Item -Recurse "js" "$distFolder/"
Copy-Item -Recurse "assets" "$distFolder/"

# 4. Copy ONLY the fixed puzzle and index
Write-Host "Preparing limited puzzle data..."
Copy-Item "public/puzzles/daily-2026-04-15.json" "$distFolder/public/puzzles/"
# Create a dummy index.json with only one entry
'["2026-04-15"]' | Out-File -FilePath "$distFolder/public/puzzles/index.json" -Encoding utf8

# 5. Remove unnecessary files for standalone version
Write-Host "Cleaning up build..."
$filesToRemove = @(
    "$distFolder/js/firebase-config.js",
    "$distFolder/firestore.rules",
    "$distFolder/firebase.json",
    "$distFolder/.firebaserc",
    "$distFolder/build_basic.ps1"
)
foreach ($f in $filesToRemove) {
    if (Test-Path $f) { Remove-Item $f -Force }
}

# 6. Compress
Write-Host "Creating ZIP: $zipFile..." -ForegroundColor Yellow
Compress-Archive -Path "$distFolder/*" -DestinationPath $zipFile

Write-Host "Build Complete! File: $zipFile" -ForegroundColor Green
