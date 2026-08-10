[CmdletBinding()]
param(
    [string]$SavesRoot = 'C:\Users\chang\Saved Games\Diablo II Resurrected',
    [int]$StressIterations = 20
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
& (Join-Path $PSScriptRoot 'build-d2r-worker.ps1')
$worker = Join-Path $repoRoot 'server\bin\D2RStashWorker.exe'
$fixtures = Join-Path $repoRoot '..\D2SSharp\src\D2SSharp.Tests\Resources\105'
$testRoot = Join-Path $SavesRoot (Join-Path 'backups' ('E2E_BACKUP_TEST_TEMP_' + [guid]::NewGuid().ToString('N')))

function Invoke-Worker([string[]]$Arguments) {
    $output = & $worker @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Worker failed ($($Arguments[0])): $($output -join [Environment]::NewLine)" }
    return ($output -join [Environment]::NewLine)
}

try {
    New-Item -ItemType Directory -Force $testRoot | Out-Null
    $saves = Get-ChildItem $fixtures -Filter *.d2s -File
    $stashes = Get-ChildItem $fixtures -Filter *.d2i -File
    if ($saves.Count -eq 0 -or $stashes.Count -eq 0) { throw 'D2R fixture set is incomplete.' }

    foreach ($fixture in @($saves) + @($stashes)) {
        $copy = Join-Path $testRoot $fixture.Name
        Copy-Item -LiteralPath $fixture.FullName -Destination $copy
        $roundTrip = "$copy.roundtrip"
        $mode = if ($fixture.Extension -eq '.d2s') { 'roundtrip_save' } else { 'roundtrip_stash' }
        Invoke-Worker @($mode, $copy, $roundTrip) | Out-Null
        if ($fixture.Extension -eq '.d2s') {
            $verification = Invoke-Worker @('verify_save', $roundTrip) | ConvertFrom-Json
            if (-not $verification.validChecksum -or $verification.declaredFileSize -ne $verification.actualFileSize) {
                throw "Invalid D2S output for $($fixture.Name)."
            }
            Invoke-Worker @('parse_save', $roundTrip) | ConvertFrom-Json | Out-Null
        } else {
            Invoke-Worker @('parse_stash', $roundTrip) | ConvertFrom-Json | Out-Null
        }
    }

    $saveCopy = Join-Path $testRoot $saves[0].Name
    $saveItem = (Invoke-Worker @('parse_save', $saveCopy) | ConvertFrom-Json).items | Select-Object -First 1
    if ($null -eq $saveItem) { throw 'Save fixture has no item for remove/add verification.' }
    $saveRemoved = "$saveCopy.removed"
    $saveRestored = "$saveCopy.restored"
    Invoke-Worker @('remove_save', $saveCopy, $saveRemoved, [string]$saveItem.id) | Out-Null
    Invoke-Worker @('add_save', $saveRemoved, $saveRestored, $saveItem.rawBytesHex, '0', '0') | Out-Null
    Invoke-Worker @('verify_save', $saveRestored) | ConvertFrom-Json | Out-Null

    $stashCopy = Join-Path $testRoot $stashes[0].Name
    $stash = Invoke-Worker @('parse_stash', $stashCopy) | ConvertFrom-Json
    $stashItem = $stash.pages | ForEach-Object { $_.items } | Select-Object -First 1
    if ($null -eq $stashItem) { throw 'Stash fixture has no item for remove/add verification.' }
    $stashRemoved = "$stashCopy.removed"
    $stashRestored = "$stashCopy.restored"
    Invoke-Worker @('remove', $stashCopy, $stashRemoved, [string]$stashItem.id) | Out-Null
    Invoke-Worker @('add', $stashRemoved, $stashRestored, $stashItem.rawBytesHex, [string]$stashItem.alt_position_id, '0', '0') | Out-Null
    Invoke-Worker @('parse_stash', $stashRestored) | ConvertFrom-Json | Out-Null

    for ($i = 0; $i -lt $StressIterations; $i++) {
        Invoke-Worker @('parse_save', $saveCopy) | ConvertFrom-Json | Out-Null
        Invoke-Worker @('parse_stash', $stashCopy) | ConvertFrom-Json | Out-Null
    }

    Write-Host "D2R worker integration tests passed in $testRoot"
}
finally {
    if (Test-Path $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}