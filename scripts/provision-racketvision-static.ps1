param(
    [string]$Repository = "linfeng302/RacketVision",
    [string]$OutputRoot = "validation/training-sources/racketvision/data-static"
)

$ErrorActionPreference = "Stop"
$headers = @{ "User-Agent" = "BML-training-provisioner" }
$root = (Resolve-Path -LiteralPath (New-Item -ItemType Directory -Path $OutputRoot -Force)).Path
$files = [System.Collections.Generic.List[object]]::new()

foreach ($tree in @("annotations", "badminton/info", "badminton/all/match1")) {
    $next = "https://huggingface.co/api/datasets/$Repository/tree/main/${tree}?recursive=true&expand=false&limit=1000"
    while ($next) {
        $response = Invoke-WebRequest -Uri $next -Headers $headers -UseBasicParsing
        $page = $response.Content | ConvertFrom-Json
        foreach ($entry in $page) {
            if ($entry.type -eq "file" -and $entry.path -notlike "*/videos/*" -and $entry.path -notmatch '\.(mp4|mov|avi|mkv)$') {
                [void]$files.Add($entry)
            }
        }
        $link = [string]$response.Headers["Link"]
        $nextMatch = [Regex]::Match($link, '<([^>]+)>;\s*rel="next"')
        if ($nextMatch.Success) {
            $next = $nextMatch.Groups[1].Value
        } else {
            $next = $null
        }
    }
}

$downloaded = 0
$skipped = 0
$failures = @()
foreach ($file in $files) {
    $relative = [string]$file.path
    if ([string]::IsNullOrWhiteSpace($relative) -or $relative -match '(^|[\\/])\.\.([\\/]|$)') {
        $skipped++
        continue
    }
    $joined = Join-Path $root $relative
    $rootPrefix = $root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    try {
        $canonical = [IO.Path]::GetFullPath($joined)
    } catch [IO.PathTooLongException] {
        $canonical = $joined
    }
    if (-not $canonical.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "RacketVision path escaped output root: $relative"
    }
    $destination = $joined
    if (Test-Path -LiteralPath $destination) {
        $existing = Get-Item -LiteralPath $destination
        if ($existing.Length -eq [int64]$file.size) {
            $skipped++
            continue
        }
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    $encoded = [Uri]::EscapeUriString($relative)
    $url = "https://huggingface.co/datasets/$Repository/resolve/main/" + $encoded + "?download=true"
    $success = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -OutFile $destination
            $success = $true
            break
        } catch {
            if ($attempt -eq 3) {
                $failures += ($relative + " :: " + $_.Exception.Message)
            } else {
                Start-Sleep -Seconds 2
            }
        }
    }
    if ($success) {
        $downloaded++
        if (($downloaded % 250) -eq 0) {
            Write-Output "RacketVision files=$downloaded/$($files.Count)"
        }
    }
}

if ($failures.Count -gt 0) {
    throw "RacketVision failed files: $($failures -join ', ')"
}

$materialized = @(Get-ChildItem -LiteralPath $root -Recurse -File -Force)
if (@($materialized | Where-Object { $_.FullName -match '\\videos\\|\.(mp4|mov|avi|mkv)$' }).Count -gt 0) {
    throw "RacketVision provisioning unexpectedly materialized video files"
}
$provenance = [ordered]@{
    repository = "https://huggingface.co/datasets/$Repository"
    fetchedPrefixes = @("annotations", "badminton/info", "badminton/all/match1")
    excluded = @("*/videos/*", "*.mp4", "*.mov", "*.avi", "*.mkv")
    listedFiles = $files.Count
    downloadedFiles = $downloaded
    skippedFiles = $skipped
    bytes = (($materialized | Measure-Object -Property Length -Sum).Sum)
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
}
$provenance | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root "provenance.json") -Encoding utf8
Write-Output "RACKETVISION PROVISION PASS files=$downloaded skipped=$skipped bytes=$($provenance.bytes)"
