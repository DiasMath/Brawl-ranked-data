param(
    [ValidateRange(1, 44640)]
    [int]$IntervaloMinutos = 15,
    [ValidateRange(1, 100)]
    [int]$JogadoresPorRodada = 20,
    [string]$Regioes = 'global,BR'
)

$ErrorActionPreference = 'Stop'
$backend = Join-Path $PSScriptRoot 'backend'
$python = Join-Path $backend '.venv/Scripts/python.exe'
$pythonw = Join-Path $backend '.venv/Scripts/pythonw.exe'
$envFile = Join-Path $backend '.env.development.local'
$logFile = Join-Path $backend '.venv/meta-coleta.log'
$taskName = 'Brawl Ranked Data - Meta'

foreach ($file in @($python, $envFile)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Arquivo ausente: $file. Prepare o ambiente com npm.cmd run dev antes de agendar."
    }
}

$regions = $Regioes -replace '\s', ''
if ($regions -notmatch '^(global|[A-Z]{2})(,(global|[A-Z]{2}))*$') {
    throw 'Informe global ou códigos de país de duas letras, separados por vírgula.'
}

$execute = if (Test-Path -LiteralPath $pythonw -PathType Leaf) { $pythonw } else { $python }
$arguments = "-m app.jobs.collect_meta --env-file .env.development.local --environment development --players-per-run $JogadoresPorRodada --regions $regions --log-file .venv/meta-coleta.log"
$action = New-ScheduledTaskAction -Execute $execute -Argument $arguments -WorkingDirectory $backend
$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes($IntervaloMinutos)) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervaloMinutos)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
    -Principal $principal -Description 'Atualiza a amostra competitiva de Brawl Stars.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "Tarefa '$taskName' registrada e primeira rodada solicitada."
Write-Host "Intervalo: $IntervaloMinutos min. Perfis por rodada: $JogadoresPorRodada. Regiões: $regions."
Write-Host "Log: $logFile"
