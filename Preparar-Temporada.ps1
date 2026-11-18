[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string[]]$Tags,
    [ValidateSet('development', 'production')]
    [string]$Ambiente = 'development'
)

$ErrorActionPreference = 'Stop'
# Reuse the existing task names: running this again updates their schedules.
& (Join-Path $PSScriptRoot 'Agendar-Partidas.ps1') -Tags $Tags -Ambiente $Ambiente -IntervaloMinutos 5
& (Join-Path $PSScriptRoot 'Agendar-DraftMeta.ps1') -Ambiente $Ambiente -IntervaloMinutos 60

$names = @("Brawl Ranked Data - Partidas ($Ambiente)", "Brawl Ranked Data - DraftMeta ($Ambiente)")
foreach ($name in $names) {
    $task = Get-ScheduledTask -TaskName $name
    $info = Get-ScheduledTaskInfo -TaskName $name
    [PSCustomObject]@{
        Tarefa = $name
        Estado = $task.State
        UltimaExecucao = $info.LastRunTime
        ProximaExecucao = $info.NextRunTime
        Resultado = $info.LastTaskResult
    }
}
Write-Host 'Primeiras coletas solicitadas. Confirme o sucesso nos logs em backend/.venv.'
Write-Host 'As tarefas funcionam com o Windows ligado e o usuario conectado, mesmo com o site fechado.'
