$ErrorActionPreference = "Stop"

$Node = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$Script = Join-Path $PSScriptRoot "playwright-view.cjs"

if (-not (Test-Path $Node)) {
  throw "Bundled Codex Node runtime was not found at $Node"
}

& $Node $Script @args
