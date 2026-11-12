$ErrorActionPreference = 'Stop'
$backend = Join-Path $PSScriptRoot 'backend'
$frontend = Join-Path $PSScriptRoot 'frontend'

foreach ($file in @('backend/.env.development.local', 'frontend/.env.development.local')) {
    if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot $file) -PathType Leaf)) {
        throw "Arquivo ausente: $file. Confira a preparação de dev no README."
    }
}

$venv = Join-Path $backend '.venv'
$python = Join-Path $venv 'Scripts/python.exe'
$createVenv = !(Test-Path -LiteralPath $python -PathType Leaf)
if ($createVenv) {
    if (!(Get-Command py.exe -ErrorAction SilentlyContinue)) {
        throw 'Instale o Python 3.12 com o Python Launcher para Windows e execute npm.cmd run dev novamente.'
    }
    Write-Host 'Criando o ambiente virtual do Python...'
    & py.exe -3.12 -m venv $venv
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $python -PathType Leaf)) {
        throw 'Falha ao criar o ambiente virtual. Confira se py -3.12 está disponível.'
    }
}

$requirements = Join-Path $backend 'requirements.txt'
$collectorRequirements = Join-Path $backend 'requirements-collector.txt'
$backendHash = (Get-FileHash -LiteralPath $requirements).Hash + (Get-FileHash -LiteralPath $collectorRequirements).Hash
$backendStamp = Join-Path $venv '.brawl-dev-requirements'
$installedBackendHash = Get-Content -LiteralPath $backendStamp -TotalCount 1 -ErrorAction SilentlyContinue
if ($createVenv -or $installedBackendHash -ne $backendHash) {
    Write-Host 'Instalando as dependências do FastAPI...'
    & $python -m pip install -r $requirements
    if ($LASTEXITCODE -ne 0) {
        throw 'A instalação das dependências do backend falhou. Veja o erro do pip acima e execute npm.cmd run dev novamente.'
    }
    Set-Content -LiteralPath $backendStamp -Value $backendHash -Encoding ASCII
}

$frontendHash = (Get-FileHash -LiteralPath (Join-Path $frontend 'package-lock.json')).Hash
$frontendStamp = Join-Path $frontend 'node_modules/.brawl-dev-lock'
$next = Join-Path $frontend 'node_modules/.bin/next.cmd'
$installedFrontendHash = Get-Content -LiteralPath $frontendStamp -TotalCount 1 -ErrorAction SilentlyContinue
if ($installedFrontendHash -ne $frontendHash -or !(Test-Path -LiteralPath $next -PathType Leaf)) {
    Write-Host 'Instalando as dependências do Next.js...'
    & npm.cmd --prefix $frontend ci
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $next -PathType Leaf)) {
        throw 'A instalação das dependências do frontend falhou. Veja o erro do npm acima e execute npm.cmd run dev novamente.'
    }
    Set-Content -LiteralPath $frontendStamp -Value $frontendHash -Encoding ASCII
}

$powerShellPath = (Get-Process -Id $PID).Path
Start-Process -FilePath $powerShellPath -WorkingDirectory $PSScriptRoot -ArgumentList @(
    '-NoProfile', '-NoExit', '-Command', '& .\Iniciar-Backend.ps1'
)
Start-Process -FilePath $powerShellPath -WorkingDirectory $frontend -ArgumentList @(
    '-NoProfile', '-NoExit', '-Command', 'npm.cmd --prefix . run dev -- --hostname 127.0.0.1 --port 3000'
)

Write-Host 'Janelas do FastAPI e do Next.js abertas.'
Write-Host 'Quando o Next.js estiver pronto, abra http://127.0.0.1:3000.'
