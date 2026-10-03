param(
    [string]$FolderId = "1wQr4DpMbx-e8jFnvOH9WUJXxfXgTC1IJ",
    [string]$OutputRoot = "validation/training-sources/bfmd/data/BFMD_data"
)

$ErrorActionPreference = "Stop"
$gdown = (Get-Command gdown.exe -ErrorAction SilentlyContinue).Source
if (-not $gdown) {
    $candidate = "C:\Users\Legion\AppData\Roaming\Python\Python313\Scripts\gdown.exe"
    if (Test-Path -LiteralPath $candidate) {
        $gdown = $candidate
    }
}
if (-not $gdown) {
    throw "gdown.exe is required to provision the public BFMD annotation folder"
}

$root = (Resolve-Path -LiteralPath (New-Item -ItemType Directory -Path $OutputRoot -Force)).Path
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$json = & $gdown --folder --json $FolderId 2>$null | Out-String
$ErrorActionPreference = $previousErrorActionPreference
$items = $json | ConvertFrom-Json
$failures = @()
$downloaded = 0
$skipped = 0

foreach ($item in $items) {
    $relative = [string]$item.path
    if ([string]::IsNullOrWhiteSpace($relative) -or $relative -match '(^|[\\/])\.\.([\\/]|$)') {
        $skipped++
        continue
    }
    if ($relative -match '\.(pyc|bak)$' -or $relative -match '\.(mp4|mov|avi|mkv)$') {
        $skipped++
        continue
    }
    $destination = [IO.Path]::GetFullPath((Join-Path $root $relative))
    if (-not $destination.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "BFMD path escaped output root: $relative"
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    & $gdown --continue --quiet ([string]$item.url) -O $destination
    if ($LASTEXITCODE -ne 0) {
        $failures += $relative
        continue
    }
    $downloaded++
    if (($downloaded % 10) -eq 0) {
        Write-Output "BFMD files=$downloaded/$($items.Count)"
    }
}

if ($failures.Count -gt 0) {
    throw "BFMD failed files: $($failures -join ', ')"
}

$files = @(Get-ChildItem -LiteralPath $root -Recurse -File -Force)
if (@($files | Where-Object { $_.Extension -in @('.mp4', '.mov', '.avi', '.mkv') }).Count -gt 0) {
    throw "BFMD provisioning unexpectedly materialized video files"
}
Write-Output "BFMD PROVISION PASS files=$downloaded skipped=$skipped bytes=$((($files | Measure-Object -Property Length -Sum).Sum))"
