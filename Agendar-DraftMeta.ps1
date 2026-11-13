[CmdletBinding()]
param(
    [ValidateRange(15, 1440)]
    [int]$IntervaloMinutos = 60,
    [ValidateSet('development', 'production')]
    [string]$Ambiente = 'development',
    [switch]$TestarAgora
)

$ErrorActionPreference = 'Stop'
$backend = Join-Path $PSScriptRoot 'backend'
$python = Join-Path $backend '.venv/Scripts/python.exe'
$pythonw = Join-Path $backend '.venv/Scripts/pythonw.exe'
$envName = ".env.$Ambiente.local"
$envFile = Join-Path $backend $envName
$logName = ".venv/draftmeta-coleta-$Ambiente.log"
$logFile = Join-Path $backend $logName
$taskName = "Brawl Ranked Data - DraftMeta ($Ambiente)"

foreach ($file in @($python, $envFile)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Arquivo ausente: $file. Prepare o ambiente com npm.cmd run dev."
    }
}
$jobArgs = @('-m', 'app.jobs.collect_draftmeta', '--env-file', $envName)
if ($TestarAgora) {
    Push-Location -LiteralPath $backend
    try {
        & $python @jobArgs --log-file $logName
        $result = $LASTEXITCODE
        Get-Content -LiteralPath $logFile -Tail 15
        if ($result -ne 0) { throw 'A atualização ficou incompleta. Confira o log.' }
    } finally {
        Pop-Location
    }
    return
}

$execute = if (Test-Path -LiteralPath $pythonw -PathType Leaf) { $pythonw } else { $python }
$arguments = ($jobArgs + @('--log-file', $logName)) -join ' '
$action = New-ScheduledTaskAction -Execute $execute -Argument $arguments -WorkingDirectory $backend
$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes($IntervaloMinutos)) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervaloMinutos)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 25) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
    -Principal $principal -Description 'Atualiza a Meta de todos os mapas ranqueados publicados pelo DraftMeta.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "Tarefa '$taskName' registrada e primeira rodada solicitada."
Write-Host "Intervalo: $IntervaloMinutos min. Escopo: geral e todos os mapas do pool ranqueado."
Write-Host "Log: $logFile"
