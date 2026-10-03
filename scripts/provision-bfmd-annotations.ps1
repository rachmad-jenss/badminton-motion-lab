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
$skippedExisting = 0
$skippedFiltered = 0

function Get-BfmdPrefix([string]$Path) {
    $buffer = New-Object byte[] 256
    $stream = [IO.File]::OpenRead($Path)
    try {
        $read = $stream.Read($buffer, 0, $buffer.Length)
    } finally {
        $stream.Dispose()
    }
    return [Text.Encoding]::UTF8.GetString($buffer, 0, $read).TrimStart()
}

function Invoke-BfmdDownload([object]$Item, [string]$Destination) {
    $match = [regex]::Match([string]$Item.url, 'id=([^&]+)')
    if (-not $match.Success) {
        throw "BFMD item has no Drive id: $($Item.path)"
    }

    $id = $match.Groups[1].Value
    $partial = "$Destination.part"
    $directUri = "https://drive.google.com/uc?export=download&id=$id"
    try {
        Invoke-WebRequest -Uri $directUri -MaximumRedirection 5 -UseBasicParsing -TimeoutSec 120 -OutFile $partial
        $prefix = Get-BfmdPrefix $partial
        if ($prefix.StartsWith("<")) {
            $html = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($partial))
            $uuid = ([regex]::Match($html, 'name="uuid" value="([^"]+)"')).Groups[1].Value
            if ([string]::IsNullOrWhiteSpace($uuid)) {
                throw "BFMD Drive response was HTML without a virus-scan confirmation token"
            }
            $confirmUri = "https://drive.usercontent.google.com/download?id=$id&export=download&confirm=t&uuid=$uuid"
            Invoke-WebRequest -Uri $confirmUri -MaximumRedirection 5 -UseBasicParsing -TimeoutSec 120 -OutFile $partial
            $prefix = Get-BfmdPrefix $partial
        }
        if ([string]::IsNullOrWhiteSpace($prefix) -or $prefix.StartsWith("<")) {
            throw "BFMD download returned an invalid or HTML payload"
        }
        Move-Item -LiteralPath $partial -Destination $Destination -Force
    } finally {
        if (Test-Path -LiteralPath $partial) {
            Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue
        }
    }
}

foreach ($item in $items) {
    $relative = [string]$item.path
    if ([string]::IsNullOrWhiteSpace($relative) -or $relative -match '(^|[\\/])\.\.([\\/]|$)') {
        $skippedFiltered++
        continue
    }
    if ($relative -match '\.(pyc|bak)$' -or $relative -match '\.(mp4|mov|avi|mkv)$') {
        $skippedFiltered++
        continue
    }
    $destination = [IO.Path]::GetFullPath((Join-Path $root $relative))
    if (-not $destination.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "BFMD path escaped output root: $relative"
    }
    if ((Test-Path -LiteralPath $destination) -and ((Get-Item -LiteralPath $destination).Length -gt 0)) {
        $skippedExisting++
        continue
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    try {
        Invoke-BfmdDownload $item $destination
    } catch {
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
$sourceRoot = Split-Path -Parent (Split-Path -Parent $root)
$provenance = [ordered]@{
    sourceId = "bfmd"
    repository = "https://github.com/Ning-D/BFMD"
    datasetUrl = "https://ning-d.github.io/BFMD-Dataset/"
    folderId = $FolderId
    manifestItems = $items.Count
    eligibleItems = @($items | Where-Object { $_.path -and $_.path -notmatch '\.(pyc|bak)$' -and $_.path -notmatch '\.(mp4|mov|avi|mkv)$' }).Count
    downloadedFiles = $downloaded
    existingFiles = $skippedExisting
    filteredItems = $skippedFiltered
    materializedFiles = $files.Count
    bytes = (($files | Measure-Object -Property Length -Sum).Sum)
    excluded = @("*.pyc", "*.bak", "*.mp4", "*.mov", "*.avi", "*.mkv")
    mediaPolicy = "annotations_only; no video redistribution"
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
}
$provenance | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $sourceRoot "provenance.json") -Encoding utf8
Write-Output "BFMD PROVISION PASS files=$downloaded existing=$skippedExisting filtered=$skippedFiltered bytes=$($provenance.bytes)"
