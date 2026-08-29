$ErrorActionPreference = 'Continue'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
$currentProcessId = $PID
$stopped = @()

try {
  $processes = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object {
      $_.ProcessId -ne $currentProcessId -and
      $_.CommandLine -and
      $_.CommandLine.IndexOf($repoRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0
    })

  foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    $stopped += $process.ProcessId
  }
} catch {
  Write-Warning "Could not inspect Node process command lines. Run this command from an elevated PowerShell if cleanup is incomplete."
}

if (Test-Path (Join-Path $repoRoot '.vite-dev.lock')) {
  Remove-Item -LiteralPath (Join-Path $repoRoot '.vite-dev.lock') -Force -ErrorAction SilentlyContinue
}

$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($listenerPid in $listeners) {
  if ($listenerPid -ne $currentProcessId) {
    Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
    $stopped += $listenerPid
  }
}

$uniqueStopped = @($stopped | Sort-Object -Unique)
if ($uniqueStopped.Count) {
  Write-Host "Stopped SanctuaryCompanion process(es): $($uniqueStopped -join ', ')"
} else {
  Write-Host 'No SanctuaryCompanion dev/test processes found.'
}

if (Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue) {
  Write-Warning 'Port 5173 is still occupied by a process that could not be stopped.'
} else {
  Write-Host 'Port 5173 is free.'
}
