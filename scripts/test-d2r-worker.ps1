[CmdletBinding()]
param(
    [string]$SavesRoot = 'C:\Users\chang\Saved Games\Diablo II Resurrected',
    [int]$StressIterations = 20
)

$ErrorActionPreference = 'Stop'
$env:D2R_SAVES_ROOT = $SavesRoot
$env:D2R_STRESS_ITERATIONS = [string]$StressIterations
npm run test:worker
if ($LASTEXITCODE -ne 0) { throw 'JavaScript D2R worker integration tests failed.' }