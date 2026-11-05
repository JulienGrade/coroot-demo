param(
    [ValidateSet('up', 'start', 'stop', 'traffic', 'pause', 'sql', 'cpu', 'outage', 'regression', 'reset', 'verify', 'status', 'logs', 'urls')]
    [string]$Action = 'status'
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$VmName = 'coroot-demo'

function Invoke-Multipass {
    & multipass @args
    if ($LASTEXITCODE -ne 0) { throw "Multipass a echoue (code $LASTEXITCODE)." }
}

if (-not (Get-Command multipass -ErrorAction SilentlyContinue)) {
    throw 'Installer Multipass, puis rouvrir PowerShell.'
}

if ($Action -eq 'up') {
    & multipass info $VmName *> $null
    $Exists = $LASTEXITCODE -eq 0
    if ($Exists) {
        Invoke-Multipass start $VmName
        Invoke-Multipass @('exec', $VmName, '--', 'test', '-f', '/etc/coroot-demo')
    } else {
        Invoke-Multipass launch 24.04 --name $VmName --cpus 6 --memory 10G --disk 45G
        Invoke-Multipass @('exec', $VmName, '--', 'sudo', 'touch', '/etc/coroot-demo')
    }
    New-Item -ItemType Directory -Force .local | Out-Null
    & tar.exe --exclude='./.local' --exclude='./app/node_modules' --exclude='./.git' -czf .local/project.tgz .
    if ($LASTEXITCODE -ne 0) { throw 'Creation de l archive echouee.' }
    Invoke-Multipass transfer .local/project.tgz "${VmName}:/tmp/coroot-demo.tgz"
    Invoke-Multipass @('exec', $VmName, '--', 'mkdir', '-p', '/home/ubuntu/coroot-demo')
    Invoke-Multipass @('exec', $VmName, '--', 'tar', '-xzf', '/tmp/coroot-demo.tgz', '-C', '/home/ubuntu/coroot-demo')
    Invoke-Multipass @('exec', $VmName, '--', 'sudo', 'bash', '/home/ubuntu/coroot-demo/scripts/bootstrap.sh')
} elseif ($Action -eq 'stop') {
    Invoke-Multipass stop $VmName
} elseif ($Action -eq 'start') {
    Invoke-Multipass start $VmName
    Write-Host 'Attendre le retour des Pods, puis lancer status et verify.'
} else {
    Invoke-Multipass @('exec', $VmName, '--', 'sudo', 'bash', '/home/ubuntu/coroot-demo/scripts/control.sh', $Action)
}
