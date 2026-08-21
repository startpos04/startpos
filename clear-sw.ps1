# Script to clear service worker cache files
# Run this if you're still experiencing service worker issues after the code changes

Write-Host "Clearing service worker cache files..." -ForegroundColor Yellow

# Remove the built service worker from public directory (dev builds)
$swPath = Join-Path $PSScriptRoot "public\sw.js"
if (Test-Path $swPath) {
    Remove-Item $swPath -Force
    Write-Host "✓ Removed public/sw.js" -ForegroundColor Green
} else {
    Write-Host "✓ No sw.js found in public/" -ForegroundColor Gray
}

# Remove the service worker from .output (production builds)
$outputSwPath = Join-Path $PSScriptRoot ".output\public\sw.js"
if (Test-Path $outputSwPath) {
    Remove-Item $outputSwPath -Force
    Write-Host "✓ Removed .output/public/sw.js" -ForegroundColor Green
} else {
    Write-Host "✓ No sw.js found in .output/public/" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Service worker files cleared!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Clear your browser cache (Ctrl+Shift+Delete)" -ForegroundColor White
Write-Host "2. In DevTools, go to Application > Service Workers" -ForegroundColor White
Write-Host "3. Click 'Unregister' on any service workers" -ForegroundColor White
Write-Host "4. Restart your dev server" -ForegroundColor White
Write-Host "5. Hard refresh your browser (Ctrl+Shift+R)" -ForegroundColor White
