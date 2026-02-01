 Build script for Chrome extension
$outputFile = "ytbackground-chrome.zip"

# Remove old build if exists
if (Test-Path $outputFile) {
    Remove-Item $outputFile
}

# Create temp build folder
$temp = "chrome-build-temp"
if (Test-Path $temp) {
    Remove-Item -Path $temp -Recurse -Force
}
New-Item -ItemType Directory -Path $temp | Out-Null

# Copy files to temp folder
Copy-Item "manifest-chrome.json" "$temp/manifest.json"
Copy-Item -Path "scripts" -Destination "$temp/scripts" -Recurse
Copy-Item -Path "icons" -Destination "$temp/icons" -Recurse

# Create zip from temp folder contents
Compress-Archive -Path "$temp/*" -DestinationPath $outputFile -Force

# Clean up temp folder
Remove-Item -Path $temp -Recurse -Force

Write-Host "Built $outputFile successfully!" -ForegroundColor Green
$size = (Get-Item $outputFile).Length
Write-Host "File size: $([math]::Round($size/1KB, 1)) KB" -ForegroundColor Cyan