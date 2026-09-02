$ErrorActionPreference = 'Stop'

$botDir = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $PSScriptRoot 'run-bot.cmd'
$taskName = 'KPB Discord Bot'

if (-not (Test-Path $runner)) { throw "Missing $runner" }
if (-not (Test-Path (Join-Path $botDir '.env'))) { throw "Missing $botDir\.env" }

$action = New-ScheduledTaskAction -Execute $runner -WorkingDirectory $botDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -DontStopOnIdleEnd `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Removed the existing task."
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null

Write-Host "Registered '$taskName'. It starts at logon."
Write-Host ""
Write-Host "  Start now:  Start-ScheduledTask -TaskName '$taskName'"
Write-Host "  Stop:       Stop-ScheduledTask  -TaskName '$taskName'"
Write-Host "  Remove:     Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
Write-Host "  Logs:       Get-Content '$botDir\logs\bot.log' -Tail 40 -Wait"
