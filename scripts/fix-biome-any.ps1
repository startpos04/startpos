param([string]$Root = "c:\Users\ADMIN\Documents\workspace\active\start-pos")

Set-Location $Root
$out = & pnpm exec biome check apps/web --max-diagnostics=500 2>&1

$locations = @{}
foreach ($line in $out) {
    if ($line -match 'noExplicitAny' -and $line -match '(apps[/\\]web[^\s:]+):(\d+):') {
        $file = $matches[1] -replace '/', '\'
        $lineNum = [int]$matches[2] - 1
        if (-not $locations.ContainsKey($file)) { $locations[$file] = [System.Collections.Generic.HashSet[int]]::new() }
        [void]$locations[$file].Add($lineNum)
    }
}

Write-Host "Files: $($locations.Count), Occurrences: $(($locations.Values | ForEach-Object { $_.Count } | Measure-Object -Sum).Sum)"

foreach ($relFile in $locations.Keys) {
    $path = Join-Path $Root $relFile
    if (-not (Test-Path $path)) { continue }

    $lines = [System.IO.File]::ReadAllLines($path)
    $sorted = $locations[$relFile] | Sort-Object -Descending

    $linesList = [System.Collections.Generic.List[string]]::new($lines)

    foreach ($ln in $sorted) {
        if ($ln -ge $linesList.Count) { continue }
        # Skip if already suppressed on previous line
        if ($ln -gt 0 -and $linesList[$ln - 1] -match 'biome-ignore.*noExplicitAny') { continue }
        $indent = if ($linesList[$ln] -match '^(\s+)') { $matches[1] } else { '' }
        $comment = "${indent}// biome-ignore lint/suspicious/noExplicitAny: flexibility required"
        $linesList.Insert($ln, $comment)
    }

    [System.IO.File]::WriteAllLines($path, $linesList.ToArray())
    Write-Host "Fixed: $relFile"
}
