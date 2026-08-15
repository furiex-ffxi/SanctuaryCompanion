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
$itemAssetRoot = if ($env:D2R_ITEM_ASSET_DIR) { (Resolve-Path -LiteralPath $env:D2R_ITEM_ASSET_DIR).Path } else { $null }

function Assert-ImageKeys($value, [string]$sourceName) {
    if ($null -eq $value) { return }
    if ($value -is [System.Array]) {
        foreach ($entry in $value) { Assert-ImageKeys $entry $sourceName }
        return
    }
    if ($value.PSObject.Properties['image_key'] -and $value.image_key) {
        if ($itemAssetRoot) {
            $asset = Join-Path $itemAssetRoot ($value.image_key + '.png')
            if (-not (Test-Path -LiteralPath $asset)) {
                throw "Missing configured local item image asset '$($value.image_key)' for $sourceName."
            }
        }
    }
    foreach ($property in $value.PSObject.Properties) {
        if ($property.Name -notin @('rawBytesHex', 'magic_attributes', 'runeword_attributes', 'set_attributes', 'displayed_combined_magic_attributes')) {
            Assert-ImageKeys $property.Value $sourceName
        }
    }
}
function Assert-LevelFields($value, [string]$sourceName) {
    if ($null -eq $value) { return }
    if ($value -is [System.Array]) { foreach ($entry in $value) { Assert-LevelFields $entry $sourceName }; return }
    if ($value.PSObject.Properties['equippable']) {
        if ($value.equippable -and ($null -eq $value.level_requirement -or [int]$value.level_requirement -le 0)) {
            throw "Equippable item in $sourceName has an invalid level_requirement."
        }
        if ($value.PSObject.Properties['skill_tab_name'] -and $value.skill_tab_name -eq 'Unknown') {
            throw "Skill-tab item in $sourceName has an unknown skill-tab mapping."
        }
        if ($value.equippable -and [int]$value.quality -in @(4, 6, 8) -and -not ([string]$value.level_requirement_source).Contains('affixes[')) {
            throw "Quality item in $sourceName is missing affix-derived requirement provenance."
        }
        if ($value.PSObject.Properties.Name -notcontains 'item_level') {
            throw "Item in $sourceName is missing item_level."
        }
    }
    foreach ($property in $value.PSObject.Properties) {
        if ($property.Name -notin @('rawBytesHex', 'magic_attributes', 'runeword_attributes', 'set_attributes', 'displayed_combined_magic_attributes')) {
            Assert-LevelFields $property.Value $sourceName
        }
    }
}
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
            $parsedSave = Invoke-Worker @('parse_save', $roundTrip) | ConvertFrom-Json
            Assert-ImageKeys $parsedSave $fixture.Name
            Assert-LevelFields $parsedSave $fixture.Name
            $requiredParseFields = @('contained_items', 'merc_items', 'corpse_items', 'iron_golem_item')
            foreach ($field in $requiredParseFields) {
                if ($parsedSave.PSObject.Properties.Name -notcontains $field) {
                    throw "parse_save output for $($fixture.Name) is missing $field."
                }
            }
        } else {
            $parsedStash = Invoke-Worker @('parse_stash', $roundTrip) | ConvertFrom-Json
            Assert-ImageKeys $parsedStash $fixture.Name
            Assert-LevelFields $parsedStash $fixture.Name
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
        $repeatSave = Invoke-Worker @('parse_save', $saveCopy) | ConvertFrom-Json
        if ($repeatSave.PSObject.Properties.Name -notcontains 'merc_items') { throw 'Repeated parse omitted extended item fields.' }
        Invoke-Worker @('parse_stash', $stashCopy) | ConvertFrom-Json | Out-Null
    }

    Write-Host "D2R worker integration tests passed in $testRoot"
}
finally {
    if (Test-Path $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
