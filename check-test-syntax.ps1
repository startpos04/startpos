# E2E Test Syntax Checker
# Checks for common Playwright selector issues

$testFiles = Get-ChildItem -Path "__tests__\e2e\v1-certification-*.spec.ts"

Write-Host "`n=== Checking E2E Test Syntax ===" -ForegroundColor Cyan

$issues = @()

foreach ($file in $testFiles) {
    $content = Get-Content $file.FullName -Raw
    $fileName = $file.Name
    
    # Check for comma-separated selectors (usually wrong)
    if ($content -match "page\.locator\([^)]+,\s*[^)]+\)") {
        $issues += "$fileName : Possible comma-separated selector issue"
    }
    
    # Check for :near() pseudo-selector
    if ($content -match ":near\(") {
        $issues += "$fileName : Found :near() pseudo-selector (may cause issues)"
    }
    
    # Check for orphaned await outside async functions
    if ($content -match "^\s+await\s+" -and $content -notmatch "async") {
        $issues += "$fileName : Possible orphaned await statement"
    }
}

if ($issues.Count -eq 0) {
    Write-Host "`n✅ No obvious syntax issues found!`n" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  Found $($issues.Count) potential issues:`n" -ForegroundColor Yellow
    foreach ($issue in $issues) {
        Write-Host "  - $issue" -ForegroundColor Yellow
    }
    Write-Host ""
}

Write-Host "Next step: Run tests individually to see actual failures`n" -ForegroundColor Cyan
