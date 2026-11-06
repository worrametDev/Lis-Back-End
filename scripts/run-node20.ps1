$ErrorActionPreference = 'Stop'

$nodeExe = Resolve-Path (Join-Path $PSScriptRoot '..\..\.tools\node-v20.20.2-win-x64\node.exe')
if (-not (Test-Path -LiteralPath $nodeExe)) {
  throw 'ไม่พบ Node.js 20 portable ที่ D:\Lis\.tools\node-v20.20.2-win-x64'
}

& $nodeExe @args
exit $LASTEXITCODE
