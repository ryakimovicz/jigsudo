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
Write-Host "Preparing limited puzzle data (2026-04-15 only)..."
Copy-Item "public/puzzles/daily-2026-04-15.json" "$distFolder/public/puzzles/"
# Create a dummy index.json with only one entry
'["2026-04-15"]' | Out-File -FilePath "$distFolder/public/puzzles/index.json" -Encoding utf8

# 4.1 Force fallback board_data to match 15/04 for total consistency
Copy-Item "public/puzzles/daily-2026-04-15.json" "$distFolder/js/board_data.json" -Force

# 5. Remove unnecessary files for standalone version
Write-Host "Cleaning up build..."
$filesToRemove = @(
    "$distFolder/js/firebase-config.js",
    "$distFolder/js/utils/secrets.js",
    "$distFolder/js/utils/crypto.js",
    "$distFolder/css/admin.css",
    "$distFolder/css/auth.css",
    "$distFolder/css/profile.css",
    "$distFolder/css/migration.css",
    "$distFolder/css/lock.css",
    "$distFolder/firestore.rules",
    "$distFolder/firebase.json",
    "$distFolder/.firebaserc",
    "$distFolder/build_basic.ps1"
)
foreach ($f in $filesToRemove) {
    if (Test-Path $f) { Remove-Item $f -Force }
}

# 5.1 Deep Clean index.html (Purge Admin and Auth Modals from source)
Write-Host "Purging non-demo sections from index.html..."
$htmlPath = "$distFolder/index.html"
if (Test-Path $htmlPath) {
    $content = Get-Content $htmlPath -Raw
    
    # Purge Admin Section
    $content = $content -replace '(?s)<!-- Admin Section.*?<section id="admin-section".*?</section>', '<!-- Admin Purged -->'
    
    # Purge Auth Modals
    $modals = @("login-modal", "password-confirm-modal", "password-reset-modal", "logout-confirm-modal", "delete-account-confirm-modal")
    foreach ($m in $modals) {
        # This regex matches the comment + the outer div with the ID
        $regex = "(?s)<!-- .*?Modal -->\s*<div id=""$m"".*?</div>\s*</div>"
        $content = $content -replace $regex, "<!-- Modal $m Purged -->"
    }

    $content | Out-File -FilePath $htmlPath -Encoding utf8 -Force
}

# 6. Compress
Write-Host "Creating ZIP: $zipFile..." -ForegroundColor Yellow
Compress-Archive -Path "$distFolder/*" -DestinationPath $zipFile

Write-Host "Build Complete! File: $zipFile" -ForegroundColor Green
