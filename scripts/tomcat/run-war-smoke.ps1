param(
    [switch]$Help,
    [switch]$SkipBuild,
    [string]$War = "",
    [string]$Context = "ROOT"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Show-Usage {
    @"
Usage: run-war-smoke.cmd [--skip-build] [--war path\to\MicrobeTrace_*.war] [--context ROOT]

Options:
  --skip-build       Do not run scripts\build-war.cmd before deployment.
  --war PATH         Specify WAR to deploy.
  --context NAME     Deployment context (default: ROOT).
"@ | Write-Output
}

if ($Help) {
    Show-Usage
    exit 0
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$TomcatVersion = if ([string]::IsNullOrWhiteSpace($env:TOMCAT_VERSION)) { "10.1.33" } else { $env:TOMCAT_VERSION }
$TomcatServerDir = if ([string]::IsNullOrWhiteSpace($env:TOMCAT_SERVER_DIR)) { Join-Path $RepoRoot "tomcat-server" } else { $env:TOMCAT_SERVER_DIR }
$TomcatHome = Join-Path $TomcatServerDir "apache-tomcat-$TomcatVersion"
$WebAppsDir = Join-Path $TomcatHome "webapps"
$LogsDir = Join-Path $TomcatHome "logs"
$TempDir = Join-Path $TomcatHome "temp"
$WorkDir = Join-Path $TomcatHome "work"
$TomcatPort = if ([string]::IsNullOrWhiteSpace($env:TOMCAT_HTTP_PORT)) { 8080 } else { [int]$env:TOMCAT_HTTP_PORT }
$PidFile = Join-Path $TomcatHome "tomcat-local.pid"
$Url = "http://localhost:$TomcatPort/"

if ($Context -match "[\\/]" ) {
    throw "Context name must not contain path separators."
}

if ([string]::IsNullOrWhiteSpace($Context)) {
    $Context = "ROOT"
}

function Test-PortInUse {
    param([int]$Port)

    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        $listener.Stop()
        return $false
    }
    catch {
        return $true
    }
    finally {
        if ($listener -and $listener.Server) {
            $listener.Stop()
        }
    }
}

function Ensure-Tomcat {
    param([string]$TomcatHomePath)

    if (Test-Path (Join-Path $TomcatHomePath "bin\catalina.bat")) {
        New-Item -ItemType Directory -Path $WebAppsDir,$LogsDir,$TempDir,$WorkDir -Force | Out-Null
        return
    }

    $version = $TomcatVersion
    $archivePath = Join-Path $TomcatServerDir "apache-tomcat-$version.tar.gz"
    $url = "https://archive.apache.org/dist/tomcat/tomcat-10/v$version/bin/apache-tomcat-$version.tar.gz"

    if (-not (Test-Path $TomcatServerDir)) {
        New-Item -ItemType Directory -Path $TomcatServerDir -Force | Out-Null
    }

    if (Test-Path (Join-Path $TomcatHomePath "bin")) {
        Remove-Item -Recurse -Force (Join-Path $TomcatHomePath "bin")
    }

    Write-Output "Downloading Tomcat $version ..."
    Invoke-WebRequest -Uri $url -OutFile $archivePath

    Write-Output "Extracting Tomcat $version ..."
    if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
        throw "tar is required to extract Tomcat distribution."
    }
    tar -xzf $archivePath -C $TomcatServerDir
    Remove-Item $archivePath -ErrorAction SilentlyContinue

    if (-not (Test-Path (Join-Path $TomcatHomePath "bin\catalina.bat"))) {
        throw "Tomcat extraction failed. Check downloaded archive and permissions."
    }

    New-Item -ItemType Directory -Path $WebAppsDir,$LogsDir,$TempDir,$WorkDir -Force | Out-Null
    if (Test-Path (Join-Path $WebAppsDir "ROOT.war")) {
        Remove-Item -Path (Join-Path $WebAppsDir "ROOT.war") -Force
    }
    if (Test-Path (Join-Path $WebAppsDir "ROOT")) {
        Remove-Item -Recurse -Force (Join-Path $WebAppsDir "ROOT")
    }
}

function Resolve-WarPath {
    param([string]$GivenWarPath)

    if (-not [string]::IsNullOrWhiteSpace($GivenWarPath)) {
        if (-not (Test-Path $GivenWarPath)) {
            throw "WAR path does not exist: $GivenWarPath"
        }
        return (Resolve-Path $GivenWarPath).Path
    }

    $distDir = Join-Path $RepoRoot "dist"
    $war = Get-ChildItem -Path $distDir -Filter "MicrobeTrace_*.war" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $war) {
        throw "No WAR file found in dist/. Run the build step first or pass --war."
    }

    return $war.FullName
}

function Deploy-War {
    param(
        [string]$WarPath,
        [string]$DeploymentContext
    )

    if (-not (Test-Path $TomcatHome)) {
        throw "Tomcat is not set up. Run setup first."
    }

    New-Item -ItemType Directory -Path $WebAppsDir -Force | Out-Null

    if ($DeploymentContext -ieq "ROOT") {
        $TargetWar = Join-Path $WebAppsDir "ROOT.war"
        $TargetDir = Join-Path $WebAppsDir "ROOT"
    }
    else {
        $TargetWar = Join-Path $WebAppsDir "$DeploymentContext.war"
        $TargetDir = Join-Path $WebAppsDir $DeploymentContext
    }

    if (Test-Path $TargetDir) { Remove-Item -Recurse -Force $TargetDir }
    if (Test-Path $TargetWar) { Remove-Item -Force $TargetWar }
    Copy-Item -Path $WarPath -Destination $TargetWar
    Write-Output "Deployed '$WarPath' to '$TargetWar'"
}

function Start-Tomcat {
    if (Test-Path $PidFile) {
        $existingPid = Get-Content $PidFile -ErrorAction SilentlyContinue
        if (-not [string]::IsNullOrWhiteSpace($existingPid) -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
            Write-Output "Tomcat already running (PID $existingPid)."
            Write-Output "Visit $Url"
            exit 0
        }
        Remove-Item -Force $PidFile -ErrorAction SilentlyContinue
    }

    if (Test-PortInUse -Port $TomcatPort) {
        throw "Port $TomcatPort is already in use. Stop the existing service or set TOMCAT_HTTP_PORT."
    }

    $catalinaScript = Join-Path $TomcatHome "bin\startup.bat"
    if (-not (Test-Path $catalinaScript)) {
        throw "Tomcat startup script not found at $catalinaScript"
    }

    New-Item -ItemType Directory -Path $LogsDir,$TempDir,$WorkDir,$WebAppsDir -Force | Out-Null

    $env:CATALINA_HOME = $TomcatHome
    $env:CATALINA_BASE = $TomcatHome
    $env:CATALINA_PID = $PidFile
    $env:CATALINA_TMPDIR = $TempDir

    $comspec = Join-Path $env:SystemRoot "System32\cmd.exe"
    Start-Process -FilePath $comspec -ArgumentList "/c `"$catalinaScript`"" -WindowStyle Hidden

    $deadline = (Get-Date).AddSeconds(20)
    while ((-not (Test-Path $PidFile)) -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 250
    }

    if (Test-Path $PidFile) {
        Write-Output "Tomcat started. PID: $((Get-Content $PidFile))"
    }
    else {
        Write-Output "Tomcat started. Check logs in '$LogsDir'."
    }

    Write-Output "URL: $Url"
}

function Wait-ForStartup {
    $deadline = (Get-Date).AddSeconds(90)
    while (Get-Date -lt $deadline) {
        $started = Get-ChildItem -Path $LogsDir -Filter "*.log" -ErrorAction SilentlyContinue |
            ForEach-Object {
                Select-String -Path $_.FullName -Pattern "Server startup in" -SimpleMatch -ErrorAction SilentlyContinue
            }
        if ($started) {
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Tomcat did not report startup completion in logs. Check $LogsDir."
}

function Test-Smoke {
    try {
        $response = Invoke-WebRequest -Uri $Url -Method Head -TimeoutSec 20 -UseBasicParsing
        if ($response.StatusCode -ne 200 -and $response.StatusCode -ne 302) {
            throw "Unexpected status code $($response.StatusCode)"
        }
        Write-Output "Smoke check passed. App available at $Url"
    }
    catch {
        throw "Smoke check failed: $($_.Exception.Message)"
    }
}

if ($SkipBuild -eq $false) {
    if ($env:OS -and $env:OS -match "Windows_NT") {
        Push-Location $RepoRoot
        try {
            & cmd /c "scripts\\build-war.cmd"
            if ($LASTEXITCODE -ne 0) {
                throw "scripts\\build-war.cmd failed with exit code $LASTEXITCODE."
            }
        }
        finally {
            Pop-Location
        }
    }
    else {
        & bash (Join-Path $RepoRoot "scripts/build-war.sh")
    }
}

Ensure-Tomcat -TomcatHomePath $TomcatHome

$resolvedWar = Resolve-WarPath -GivenWarPath $War
Deploy-War -WarPath $resolvedWar -DeploymentContext $Context
Start-Tomcat
Wait-ForStartup
Test-Smoke
