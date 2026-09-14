import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';

type CypressBrowser = {
  displayName?: string;
  family?: string;
  name?: string;
  path?: string;
};

type BrowserLaunchOptions = {
  args: string[];
};

type BrowserLaunchContext = {
  browserName: string;
  executableName: string;
  marker: string;
};

export type BrowserProcessMemorySnapshot = {
  phase: string;
  capturedAt: string;
  platform: string;
  browserName: string | null;
  available: boolean;
  reason: string | null;
  rootPid: number | null;
  processCount: number;
  workingSetBytes: number | null;
  privateBytes: number | null;
  summedProcessPeakWorkingSetBytes: number | null;
  processTypes: Record<string, {
    count: number;
    workingSetBytes: number;
    privateBytes: number;
  }>;
  gpu: {
    available: boolean;
    reason: string | null;
    processCount: number;
    dedicatedBytes: number | null;
    sharedBytes: number | null;
    residentBytes: number | null;
    totalCommittedBytes: number | null;
  };
};

let browserLaunchContext: BrowserLaunchContext | null = null;

function unavailableSnapshot(
  phase: string,
  reason: string,
  browserName = browserLaunchContext?.browserName || null,
): BrowserProcessMemorySnapshot {
  return {
    phase,
    capturedAt: new Date().toISOString(),
    platform: process.platform,
    browserName,
    available: false,
    reason,
    rootPid: null,
    processCount: 0,
    workingSetBytes: null,
    privateBytes: null,
    summedProcessPeakWorkingSetBytes: null,
    processTypes: {},
    gpu: {
      available: false,
      reason,
      processCount: 0,
      dedicatedBytes: null,
      sharedBytes: null,
      residentBytes: null,
      totalCommittedBytes: null,
    },
  };
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

function runPowerShellJson(script: string): any {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const output = execFileSync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    },
  ).trim();

  if (!output) throw new Error('Windows memory collector returned no output');
  return JSON.parse(output);
}

function captureWindowsBrowserMemory(
  context: BrowserLaunchContext,
  phase: string,
): BrowserProcessMemorySnapshot {
  const marker = escapePowerShellSingleQuoted(context.marker);
  const executableName = escapePowerShellSingleQuoted(context.executableName);
  const browserName = escapePowerShellSingleQuoted(context.browserName);
  const snapshotPhase = escapePowerShellSingleQuoted(phase);
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$processes = @(Get-CimInstance Win32_Process -Filter "Name='${executableName}'")
$root = $processes |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${marker}') } |
  Sort-Object CreationDate -Descending |
  Select-Object -First 1

if (-not $root) {
  [pscustomobject]@{
    phase = '${snapshotPhase}'
    capturedAt = [DateTime]::UtcNow.ToString('o')
    platform = 'win32'
    browserName = '${browserName}'
    available = $false
    reason = 'Could not identify the isolated browser process from its launch marker.'
  } | ConvertTo-Json -Depth 7 -Compress
  exit 0
}

$ids = New-Object 'System.Collections.Generic.HashSet[int]'
[void]$ids.Add([int]$root.ProcessId)
$changed = $true
while ($changed) {
  $changed = $false
  foreach ($process in $processes) {
    if ($ids.Contains([int]$process.ParentProcessId) -and -not $ids.Contains([int]$process.ProcessId)) {
      [void]$ids.Add([int]$process.ProcessId)
      $changed = $true
    }
  }
}

$details = @()
foreach ($process in $processes) {
  if (-not $ids.Contains([int]$process.ProcessId)) { continue }
  try {
    $runtime = Get-Process -Id $process.ProcessId -ErrorAction Stop
    $type = 'browser'
    if ($process.CommandLine -match '--type=([^\s\"]+)') { $type = $Matches[1] }
    $details += [pscustomobject]@{
      pid = [int]$process.ProcessId
      type = $type
      workingSetBytes = [long]$runtime.WorkingSet64
      privateBytes = [long]$runtime.PrivateMemorySize64
      peakWorkingSetBytes = [long]$runtime.PeakWorkingSet64
    }
  } catch { }
}

$typeGroups = @{}
foreach ($detail in $details) {
  if (-not $typeGroups.ContainsKey($detail.type)) {
    $typeGroups[$detail.type] = [ordered]@{
      count = 0
      workingSetBytes = [long]0
      privateBytes = [long]0
    }
  }
  $typeGroups[$detail.type].count += 1
  $typeGroups[$detail.type].workingSetBytes += [long]$detail.workingSetBytes
  $typeGroups[$detail.type].privateBytes += [long]$detail.privateBytes
}

$gpuAvailable = $true
$gpuReason = $null
$gpuRows = @()
try {
  $gpuRows = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory)
} catch {
  $gpuAvailable = $false
  $gpuReason = $_.Exception.Message
}

$gpuPids = New-Object 'System.Collections.Generic.HashSet[int]'
$gpuDedicated = [long]0
$gpuShared = [long]0
$gpuCommitted = [long]0
if ($gpuAvailable) {
  foreach ($gpuRow in $gpuRows) {
    if ($gpuRow.Name -notmatch '^pid_(\d+)_') { continue }
    $pidValue = [int]$Matches[1]
    if (-not $ids.Contains($pidValue)) { continue }
    [void]$gpuPids.Add($pidValue)
    $gpuDedicated += [long]$gpuRow.DedicatedUsage
    $gpuShared += [long]$gpuRow.SharedUsage
    $gpuCommitted += [long]$gpuRow.TotalCommitted
  }
}

$workingSet = [long](($details | Measure-Object workingSetBytes -Sum).Sum)
$privateBytes = [long](($details | Measure-Object privateBytes -Sum).Sum)
$peakWorkingSet = [long](($details | Measure-Object peakWorkingSetBytes -Sum).Sum)

[pscustomobject]@{
  phase = '${snapshotPhase}'
  capturedAt = [DateTime]::UtcNow.ToString('o')
  platform = 'win32'
  browserName = '${browserName}'
  available = $true
  reason = $null
  rootPid = [int]$root.ProcessId
  processCount = @($details).Count
  workingSetBytes = $workingSet
  privateBytes = $privateBytes
  summedProcessPeakWorkingSetBytes = $peakWorkingSet
  processTypes = $typeGroups
  gpu = [pscustomobject]@{
    available = $gpuAvailable
    reason = $gpuReason
    processCount = $gpuPids.Count
    dedicatedBytes = $(if ($gpuAvailable) { $gpuDedicated } else { $null })
    sharedBytes = $(if ($gpuAvailable) { $gpuShared } else { $null })
    residentBytes = $(if ($gpuAvailable) { $gpuDedicated + $gpuShared } else { $null })
    totalCommittedBytes = $(if ($gpuAvailable) { $gpuCommitted } else { $null })
  }
} | ConvertTo-Json -Depth 7 -Compress
`;

  return runPowerShellJson(script) as BrowserProcessMemorySnapshot;
}

export function configurePerformanceBrowserMemory(
  browser: CypressBrowser,
  launchOptions: BrowserLaunchOptions,
): void {
  if (browser.family !== 'chromium') {
    browserLaunchContext = null;
    return;
  }

  const marker = `mt-memory-${process.pid}-${Date.now()}-${randomBytes(6).toString('hex')}`;
  launchOptions.args.push(`--mt-memory-marker=${marker}`);
  browserLaunchContext = {
    browserName: browser.displayName || browser.name || 'Chromium',
    executableName: (browser.path || '').split(/[\\/]/).pop() || (
      browser.name === 'edge' ? 'msedge.exe' : 'chrome.exe'
    ),
    marker,
  };
}

export function captureBrowserProcessMemory(phase = 'checkpoint'): BrowserProcessMemorySnapshot {
  if (!browserLaunchContext) {
    return unavailableSnapshot(phase, 'No isolated Chromium launch was registered for this run.');
  }

  if (process.platform !== 'win32') {
    return unavailableSnapshot(
      phase,
      `Complete process-tree and GPU telemetry is currently implemented for Windows; host is ${process.platform}.`,
    );
  }

  try {
    return captureWindowsBrowserMemory(browserLaunchContext, phase);
  } catch (error) {
    return unavailableSnapshot(
      phase,
      error instanceof Error ? error.message : String(error),
    );
  }
}
