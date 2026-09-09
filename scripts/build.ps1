$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $taskRoot
$taskCache = Join-Path $taskRoot '.cache'
New-Item -ItemType Directory -Force -Path $taskCache | Out-Null
$env:TEMP = $taskCache
$env:TMP = $taskCache
$env:npm_config_cache = Join-Path $taskCache 'npm'
npm.cmd ci --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Type checking failed' }
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
npm.cmd run package
if ($LASTEXITCODE -ne 0) { throw 'Packaging failed' }
