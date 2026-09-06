# fix-mojibake.ps1
# Fixes double-encoded UTF-8 (mojibake) characters in all source files.
# Run from the monorepo root.

$replacements = @(
    @{ From = "â€"";  To = "—" }   # em dash U+2014
    @{ From = "â€"";  To = "–" }   # en dash U+2013
    @{ From = "â€™";  To = "'" }   # right single quote U+2019
    @{ From = "â€˜";  To = "'" }   # left single quote U+2018
    @{ From = "â€œ";  To = '"' }   # left double quote U+201C
    @{ From = "â€";   To = '"' }   # right double quote U+201D
    @{ From = "â€¢";  To = "•" }   # bullet U+2022
    @{ From = "â€¦";  To = "…" }   # ellipsis U+2026
    @{ From = "â†'";  To = "→" }   # right arrow U+2192
    @{ From = "â†"";  To = "↓" }   # down arrow U+2193
    @{ From = "â†'";  To = "←" }   # left arrow U+2190
    @{ From = "â†'";  To = "↑" }   # up arrow U+2191
    @{ From = "â"€";  To = "─" }   # box U+2500
    @{ From = "â"‚";  To = "│" }   # box U+2502
    @{ From = "â"Œ";  To = "┌" }   # box U+250C
    @{ From = "â""";  To = "└" }   # box U+2514
    @{ From = "â‰¥";  To = "≥" }   # >=
    @{ From = "â‰¤";  To = "≤" }   # <=
    @{ From = "â‰ ";  To = "≠" }   # !=
    @{ From = "Â·";   To = "·" }   # middle dot
    @{ From = "Â©";   To = "©" }   # copyright
    @{ From = "Â®";   To = "®" }   # registered
    @{ From = "Â ";   To = " " }   # non-breaking space
    @{ From = "âœ"";  To = "✓" }   # check mark
    @{ From = "âœ…";  To = "✅" }   # green check
    @{ From = "âœ–";  To = "✖" }   # X mark
    @{ From = "ðŸ"";  To = "🔍" }   # magnifying glass
    @{ From = "ðŸ"¦";  To = "📦" }   # package
    @{ From = "ðŸ"Š";  To = "📊" }   # bar chart
    @{ From = "ðŸ'¡";  To = "💡" }   # bulb
    @{ From = "ðŸš€";  To = "🚀" }   # rocket
    @{ From = "ðŸ"";  To = "📋" }   # clipboard
    @{ From = "ðŸ"";  To = "🔐" }   # lock
    @{ From = "ðŸ"§";  To = "🔧" }   # wrench
    @{ From = "ðŸ›";  To = "🛑" }   # stop
    @{ From = "ðŸ"„";  To = "🔄" }   # cycle
    @{ From = "ðŸŒ";  To = "🌍" }   # earth
    @{ From = "ðŸ—„";  To = "🗄" }   # cabinet
    @{ From = "ðŸ—";  To = "🗑" }   # trash
    @{ From = "ðŸ"";  To = "📄" }   # page
    @{ From = "ðŸ–¥";  To = "🖥" }   # desktop
    @{ From = "ðŸ"…";  To = "📅" }   # calendar
    @{ From = "ðŸ §";  To = "🏠" }   # house (note: space in mojibake key)
    @{ From = "ðŸ§";  To = "🧾" }   # receipt
    @{ From = "ðŸ'³";  To = "💳" }   # card
    @{ From = "ðŸ"ˆ";  To = "📈" }   # chart up
    @{ From = "ðŸ"‰";  To = "📉" }   # chart down
    @{ From = "ðŸ›'";  To = "🛒" }   # cart
    @{ From = "ðŸ'";  To = "👥" }   # people
    @{ From = "ðŸ'";  To = "👤" }   # person
    @{ From = "ðŸ'°";  To = "💰" }   # money
    @{ From = "ðŸ¢";  To = "🏢" }   # building
    @{ From = "ðŸ ";  To = "🏠" }   # house
    @{ From = "ðŸ†";  To = "🆕" }   # new
    @{ From = "ðŸŽ¯";  To = "🎯" }   # target
    @{ From = "ðŸ"¸";  To = "📸" }   # camera
    @{ From = "ðŸ—'";  To = "🗒" }   # notepad
)

$extensions = @("*.ts", "*.tsx", "*.md", "*.sh")
$excludePattern = 'node_modules|\.git|\.output|generated|\.turbo|playwright-report|e2e-results'

$fixedCount = 0
$fileCount = 0

foreach ($ext in $extensions) {
    Get-ChildItem -Recurse -Include $ext | Where-Object { $_.FullName -notmatch $excludePattern } | ForEach-Object {
        $filePath = $_.FullName
        $original = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
        $fixed = $original

        foreach ($r in $replacements) {
            $fixed = $fixed.Replace($r.From, $r.To)
        }

        if ($fixed -ne $original) {
            [System.IO.File]::WriteAllText($filePath, $fixed, [System.Text.Encoding]::UTF8)
            $fileCount++
            Write-Output "Fixed: $($_.Name)"
        }
    }
}

Write-Output ""
Write-Output "Done. Fixed $fileCount files."
