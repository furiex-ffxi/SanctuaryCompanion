[CmdletBinding()]
param(
    [string]$D2SSharpRoot
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $D2SSharpRoot) { $D2SSharpRoot = Join-Path (Split-Path -Parent $repoRoot) 'D2SSharp' }
$lock = Get-Content (Join-Path $repoRoot 'D2SSharp.lock.json') -Raw | ConvertFrom-Json
$resolvedLibraryRoot = (Resolve-Path $D2SSharpRoot).Path
$actualCommit = (git -C $resolvedLibraryRoot rev-parse HEAD).Trim()
if ($actualCommit -ne $lock.commit) {
    throw "D2SSharp is at $actualCommit; expected pinned commit $($lock.commit)."
}

$output = Join-Path $repoRoot 'server\bin'
if (Test-Path $output) {
    Remove-Item -LiteralPath $output -Recurse -Force
}

$project = Join-Path $repoRoot 'D2RStashWorker\D2RStashWorker.csproj'
dotnet publish $project --configuration Release --runtime win-x64 --self-contained false --output $output "/p:D2SSharpProjectPath=$resolvedLibraryRoot\$($lock.project)"
if ($LASTEXITCODE -ne 0) { throw 'D2RStashWorker publish failed.' }

@{
    d2sSharpCommit = $lock.commit
    builtAtUtc = [DateTime]::UtcNow.ToString('o')
    runtime = 'win-x64'
} | ConvertTo-Json | Set-Content -NoNewline (Join-Path $output 'worker-version.json')
