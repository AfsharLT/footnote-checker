#!/bin/bash
# Resolve the actual Installer identity; never assume /Users/<name> or an admin's HOME.
fnc_user_home() {
    local name record result
    [ "$(/usr/bin/id -u)" -ne 0 ] || { printf 'Bitte die Installation für das eigene Benutzerkonto starten.\n' >&2; return 1; }
    name=$(/usr/bin/id -un)
    record=$(/usr/bin/dscl . -read "/Users/$name" NFSHomeDirectory) || return 1
    result="${record#NFSHomeDirectory: }"
    [ "$result" != "$record" ] && [ -n "$result" ] && [ "${result#/}" != "$result" ] || return 1
    printf '%s\n' "$result"
}
