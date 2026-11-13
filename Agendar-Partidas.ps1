[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string[]]$Tags,
    [ValidateRange(1, 1440)]
    [int]$IntervaloMinutos = 5,
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
$logName = ".venv/partidas-coleta-$Ambiente.log"
$logFile = Join-Path $backend $logName
$taskName = "Brawl Ranked Data - Partidas ($Ambiente)"

foreach ($file in @($python, $envFile)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Arquivo ausente: $file. Prepare o ambiente com npm.cmd run dev."
    }
}

$normalized = @(foreach ($value in (($Tags -join ',') -split ',')) {
    $tag = $value.Trim().TrimStart('#').ToUpperInvariant()
    if ($tag -cnotmatch '^[0289PYLQGRJCUV]{3,16}$') {
        throw 'Informe tags válidas de jogador separadas por vírgula.'
    }
    $tag
})
$tagList = ($normalized | Select-Object -Unique) -join ','
$jobArgs = @('-m', 'app.jobs.collect', '--env-file', $envName, '--environment', $Ambiente,
    '--personal-only', '--tags', $tagList)

Push-Location -LiteralPath $backend
try {
    if ($TestarAgora) {
        & $python @jobArgs --log-file $logName
        if ($LASTEXITCODE -ne 0) {
            Get-Content -LiteralPath $logFile -Tail 12
            throw "A coleta de teste falhou. Confira $logFile."
        }
        Get-Content -LiteralPath $logFile -Tail 12
        return
    }
    & $python @jobArgs --check
    if ($LASTEXITCODE -ne 0) {
        throw 'Agendamento não alterado. Confira o banco, as tags e a chave cadastrada no painel.'
    }
} finally {
    Pop-Location
}

$execute = if (Test-Path -LiteralPath $pythonw -PathType Leaf) { $pythonw } else { $python }
$arguments = ($jobArgs + @('--log-file', $logName)) -join ' '
$action = New-ScheduledTaskAction -Execute $execute -Argument $arguments -WorkingDirectory $backend
$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes($IntervaloMinutos)) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervaloMinutos)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
    -Principal $principal -Description 'Atualiza o histórico pessoal de Brawl Stars.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "Tarefa '$taskName' registrada e primeira rodada solicitada."
Write-Host "Intervalo: $IntervaloMinutos min. Contas: $tagList."
Write-Host "Log: $logFile"
