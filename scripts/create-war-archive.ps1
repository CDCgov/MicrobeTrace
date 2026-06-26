param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDir,

    [Parameter(Mandatory = $true)]
    [string]$DestinationPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$resolvedSource = (Resolve-Path $SourceDir).Path
$resolvedDestination = if ([System.IO.Path]::IsPathRooted($DestinationPath)) {
    $DestinationPath
}
else {
    Join-Path (Get-Location) $DestinationPath
}

$destinationDir = Split-Path -Parent $resolvedDestination
if (-not (Test-Path $destinationDir)) {
    New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
}

if (Test-Path $resolvedDestination) {
    Remove-Item $resolvedDestination -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $resolvedSource,
    $resolvedDestination,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
)
