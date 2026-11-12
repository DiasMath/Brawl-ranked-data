param(
    [ValidateSet('development', 'production')]
    [string]$Ambiente = 'development'
)

$ErrorActionPreference = 'Stop'
$backend = Join-Path $PSScriptRoot 'backend'
$envFile = Join-Path $backend ".env.$Ambiente.local"
$python = Join-Path $backend '.venv/Scripts/python.exe'

if (!(Test-Path -LiteralPath $envFile -PathType Leaf)) {
    throw "Arquivo de ambiente ausente: $envFile"
}
if (!(Test-Path -LiteralPath $python -PathType Leaf)) {
    throw 'Crie o ambiente virtual em backend/.venv e instale requirements.txt conforme o README.'
}

$uvicornArgs = @('-m', 'uvicorn', 'app.main:app', '--env-file', $envFile, '--host', '127.0.0.1', '--port', '8787')
if ($Ambiente -eq 'development') {
    $uvicornArgs += '--reload'
}

Push-Location -LiteralPath $backend
$previousEnvironment = $env:BRAWL_ENVIRONMENT
try {
    $env:BRAWL_ENVIRONMENT = $Ambiente
    & $python @uvicornArgs
    $exitCode = $LASTEXITCODE
} finally {
    $env:BRAWL_ENVIRONMENT = $previousEnvironment
    Pop-Location
}
exit $exitCode
