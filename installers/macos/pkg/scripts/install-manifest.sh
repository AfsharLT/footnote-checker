#!/bin/bash
# Shared, unprivileged installation logic. Invoked by Installer or isolated tests.
set -euo pipefail
export PATH=/usr/bin:/bin:/usr/sbin:/sbin

fnc_fail() { printf 'Footnote-Checker: %s\n' "$1" >&2; return 1; }

fnc_validate_manifest() {
    local manifest="$1" identifier location
    [ -f "$manifest" ] && [ ! -L "$manifest" ] || { fnc_fail 'Das Installationspaket ist unvollständig.'; return 1; }
    identifier=$(/usr/bin/xmllint --nonet --xpath 'string(/*[local-name()="OfficeApp"]/*[local-name()="Id"])' "$manifest" 2>/dev/null) || return 1
    location=$(/usr/bin/xmllint --nonet --xpath 'string(/*[local-name()="OfficeApp"]/*[local-name()="DefaultSettings"]/*[local-name()="SourceLocation"]/@DefaultValue)' "$manifest" 2>/dev/null) || return 1
    [ "$identifier" = 'e99f1e9d-b886-4eb7-a1b8-2c0561b078e8' ] && [ "$location" = 'https://footnote-checker.shayesteh-afshar.workers.dev/taskpane.html' ] || { fnc_fail 'Das Paket enthält nicht die erwartete Footnote-Checker-Konfiguration.'; return 1; }
}

fnc_check_paths() {
    local user_home="$1" relative part current
    [ -d "$user_home" ] && [ ! -L "$user_home" ] && [ -w "$user_home" ] || { fnc_fail 'Der persönliche Benutzerordner ist nicht beschreibbar.'; return 1; }
    current="$user_home"
    for part in Library Containers com.microsoft.Word Data Documents wef; do
        current="$current/$part"
        [ ! -L "$current" ] || { fnc_fail 'Der Word-Ordner enthält eine Verknüpfung. Bitte die IT kontaktieren.'; return 1; }
        if [ -e "$current" ] && [ ! -d "$current" ]; then fnc_fail 'Der Word-Installationsordner ist durch eine Datei belegt.'; return 1; fi
    done
    [ -d "$user_home/Library/Containers/com.microsoft.Word/Data/Documents" ] || { fnc_fail 'Bitte Word einmal öffnen, ein Dokument öffnen und Word mit ⌘Q beenden. Danach das Paket erneut öffnen.'; return 1; }
    current="$user_home"
    for part in Library 'Application Support' Footnote-Checker 'Installer Backups'; do
        current="$current/$part"
        [ ! -L "$current" ] || { fnc_fail 'Der Sicherungsordner enthält eine Verknüpfung. Bitte die IT kontaktieren.'; return 1; }
        if [ -e "$current" ] && [ ! -d "$current" ]; then fnc_fail 'Der Sicherungsordner ist durch eine Datei belegt.'; return 1; fi
    done
    local target="$user_home/Library/Containers/com.microsoft.Word/Data/Documents/wef/manifest.production.xml"
    [ ! -L "$target" ] || { fnc_fail 'Die vorhandene Manifest-Datei ist eine Verknüpfung. Bitte die IT kontaktieren.'; return 1; }
    if [ -e "$target" ]; then
        [ -f "$target" ] || { fnc_fail 'Das Installationsziel ist keine reguläre Datei.'; return 1; }
        local previous_id
        previous_id=$(/usr/bin/xmllint --nonet --xpath 'string(/*[local-name()="OfficeApp"]/*[local-name()="Id"])' "$target" 2>/dev/null) || { fnc_fail 'Die vorhandene Datei ist nicht lesbar. Sie wurde nicht verändert.'; return 1; }
        [ "$previous_id" = 'e99f1e9d-b886-4eb7-a1b8-2c0561b078e8' ] || { fnc_fail 'Eine andere Add-in-Konfiguration belegt denselben Dateinamen. Sie wurde nicht verändert.'; return 1; }
    fi
}

fnc_check_environment() {
    local user_home="$1"
    [ "$(/usr/bin/id -u)" -ne 0 ] || { fnc_fail 'Bitte das Paket per Doppelklick für das eigene Benutzerkonto installieren, nicht als root.'; return 1; }
    [ -d '/Applications/Microsoft Word.app' ] || [ -d "$user_home/Applications/Microsoft Word.app" ] || { fnc_fail 'Microsoft Word Desktop fehlt. Bitte Word zuerst installieren und einmal öffnen.'; return 1; }
    if /usr/bin/pgrep -u "$(/usr/bin/id -u)" -x 'Microsoft Word' >/dev/null; then fnc_fail 'Bitte Dokumente speichern und Word mit ⌘Q vollständig beenden. Danach erneut installieren.'; return 1; fi
    fnc_check_paths "$user_home"
}

fnc_install_manifest() (
    set -euo pipefail
    local user_home="$1" source="$2" target_dir target_file backup_dir staged=''
    fnc_validate_manifest "$source"
    fnc_check_paths "$user_home"
    target_dir="$user_home/Library/Containers/com.microsoft.Word/Data/Documents/wef"
    target_file="$target_dir/manifest.production.xml"
    umask 077
    /bin/mkdir -p "$target_dir"
    if [ -f "$target_file" ] && /usr/bin/cmp -s "$source" "$target_file"; then
        printf 'Footnote-Checker ist für dieses Benutzerkonto bereits aktuell.\n'
        return 0
    fi
    staged=$(/usr/bin/mktemp "$target_dir/.fnc-install.XXXXXX")
    trap '[ -z "$staged" ] || /bin/rm -f "$staged"' EXIT
    /bin/cp "$source" "$staged"
    /bin/chmod 644 "$staged"
    /usr/bin/cmp -s "$source" "$staged"
    if [ -f "$target_file" ]; then
        backup_dir="$user_home/Library/Application Support/Footnote-Checker/Installer Backups/$(/bin/date -u +%Y%m%dT%H%M%SZ)-$$"
        /bin/mkdir -p "$backup_dir"
        /bin/cp -p "$target_file" "$backup_dir/manifest.production.xml"
        /usr/bin/cmp -s "$target_file" "$backup_dir/manifest.production.xml"
    fi
    /bin/mv -f "$staged" "$target_file"
    staged=''
    printf 'Footnote-Checker: Installation für dieses Benutzerkonto abgeschlossen. Word kann jetzt geöffnet werden.\n'
)
