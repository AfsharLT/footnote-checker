param([string]$InstallerUserSid = "")
$ErrorActionPreference = "Stop"

function Pause-And-Exit([int]$code = 0) {
    Write-Host ""
    Read-Host "Enter zum Schliessen"
    exit $code
}

try {
    Write-Host "Footnote-Checker - Windows Beta-Installation"
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $currentSid = $identity.User.Value
    if ($InstallerUserSid -and $InstallerUserSid -ne $currentSid) {
        throw "Anderes Administratorkonto erkannt. Abbruch: Der Office-Katalog muss zum urspruenglichen Benutzer gehoeren. Bitte IT kontaktieren."
    }
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host "Administratorabfrage nur mit demselben Benutzerkonto bestaetigen."
        $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -InstallerUserSid "{1}"' -f $PSCommandPath, $currentSid
        $child = Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
        exit $child.ExitCode
    }
    if (Get-Process WINWORD -ErrorAction SilentlyContinue) {
        throw "Bitte Word vollstaendig schliessen und den Installer erneut starten."
    }
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $manifestSource = Join-Path $scriptDir "manifest.production.xml"
    if (-not (Test-Path -LiteralPath $manifestSource -PathType Leaf)) {
        throw "manifest.production.xml fehlt neben dem Script. Bitte ZIP vollstaendig entpacken."
    }
    $catalogDir = Join-Path $env:LOCALAPPDATA "FootnoteChecker\Catalog"
    $shareName = "FootnoteCheckerCatalog"
    $catalogUrl = "\\$env:COMPUTERNAME\$shareName"
    $account = $identity.Name
    $existingShare = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue
    if ($existingShare) {
        if ($existingShare.Path -ne $catalogDir) {
            throw "Freigabename ist bereits fuer einen anderen Ordner belegt. Die Freigabe bleibt unveraendert; bitte IT kontaktieren."
        }
        foreach ($access in (Get-SmbShareAccess -Name $shareName)) {
            $accessAccount = New-Object Security.Principal.NTAccount($access.AccountName)
            $accessSid = $accessAccount.Translate([Security.Principal.SecurityIdentifier]).Value
            if ($accessSid -ne $currentSid -or $access.AccessControlType -ne "Allow") {
                throw "Bestehende Freigabe hat abweichende Berechtigungen. Keine Aenderung; bitte IT kontaktieren."
            }
        }
    }
    $guid = "{A67E8B58-4031-4D1F-B1AB-0E51C3EAF8E4}"
    $registryPath = "HKCU:\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\$guid"
    if (Test-Path -LiteralPath $registryPath) {
        $existingUrl = (Get-ItemProperty -LiteralPath $registryPath -Name Url -ErrorAction SilentlyContinue).Url
        if ($existingUrl -and $existingUrl -ne $catalogUrl) {
            throw "Vorhandener Registry-Katalog verweist auf einen anderen Pfad. Keine Ueberschreibung; bitte IT kontaktieren."
        }
    }
    New-Item -ItemType Directory -Path $catalogDir -Force | Out-Null
    $target = Join-Path $catalogDir "manifest.production.xml"
    if (Test-Path -LiteralPath $target) {
        $backup = "$target.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')-$PID"
        Copy-Item -LiteralPath $target -Destination $backup
        Write-Host "Vorhandenes Manifest gesichert: $backup"
    }
    Copy-Item -LiteralPath $manifestSource -Destination $target -Force
    if (-not $existingShare) {
        New-SmbShare -Name $shareName -Path $catalogDir -ReadAccess $account | Out-Null
    }
    New-Item -Path $registryPath -Force | Out-Null
    New-ItemProperty -Path $registryPath -Name Id -Value $guid -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $registryPath -Name Url -Value $catalogUrl -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $registryPath -Name Flags -Value 1 -PropertyType DWord -Force | Out-Null
    Write-Host ""
    Write-Host "Installation vorbereitet. Katalog: $catalogUrl" -ForegroundColor Green
    Write-Host "Word starten > Start > Add-Ins > Erweitert > Freigegebener Ordner > Footnote-Checker > Hinzufuegen."
    Pause-And-Exit 0
} catch {
    Write-Host "FEHLER: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Bereits abgeschlossene Einrichtungsschritte koennen bestehen bleiben. Details siehe INSTALLATION.md."
    Pause-And-Exit 1
}
