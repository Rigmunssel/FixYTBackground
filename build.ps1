# Build script for Firefox extension with proper forward slashes
$outputFile = "backstage-play.xpi"

# Remove old build
if (Test-Path $outputFile) {
    Remove-Item $outputFile
}

# Create temporary directory
$tempDir = "temp_build"
if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

# Copy files with proper structure
Copy-Item "manifest.json" -Destination $tempDir
Copy-Item "LICENSE" -Destination $tempDir
Copy-Item -Recurse "scripts" -Destination $tempDir
Copy-Item -Recurse "icons" -Destination $tempDir

# Create ZIP with forward slashes
Add-Type -Assembly System.IO.Compression.FileSystem
$compressionLevel = [System.IO.Compression.CompressionLevel]::Optimal
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $outputFile, $compressionLevel, $false)

# Clean up
Remove-Item -Recurse -Force $tempDir

Write-Host "Built: $outputFile" -ForegroundColor Green
