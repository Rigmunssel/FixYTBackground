# Build script for Firefox extension with proper forward slashes
$outputFile = "backstage-play.xpi"

# Remove old build
if (Test-Path $outputFile) {
    Remove-Item $outputFile
}

# Use .NET ZipArchive to manually add files with forward slashes
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = Join-Path $PWD $outputFile
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')

# Function to add file with forward slash path
function Add-FileToZip($zip, $localPath, $entryName) {
    $entry = $zip.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
    $entryStream = $entry.Open()
    $fileStream = [System.IO.File]::OpenRead($localPath)
    $fileStream.CopyTo($entryStream)
    $fileStream.Close()
    $entryStream.Close()
}

# Add root files
Add-FileToZip $zip "manifest.json" "manifest.json"
Add-FileToZip $zip "LICENSE" "LICENSE"

# Add scripts folder with forward slashes
Add-FileToZip $zip "scripts\content.js" "scripts/content.js"

# Add icons folder with forward slashes
Add-FileToZip $zip "icons\icon.svg" "icons/icon.svg"

$zip.Dispose()

Write-Host "Built: $outputFile" -ForegroundColor Green
