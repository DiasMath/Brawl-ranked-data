$ErrorActionPreference = 'Stop'
$frontend = Join-Path $PSScriptRoot 'frontend'

$requiredFiles = @(
    'backend/.env.development.local'
    'frontend/.env.development.local'
    'backend/.venv/Scripts/python.exe'
    'frontend/node_modules/.bin/next.cmd'
)
foreach ($file in $requiredFiles) {
    if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot $file) -PathType Leaf)) {
        throw "Arquivo ausente: $file. Confira a preparação de dev no README."
    }
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
