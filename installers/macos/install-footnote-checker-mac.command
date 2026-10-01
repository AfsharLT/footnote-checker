#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MANIFEST_SOURCE="$SCRIPT_DIR/manifest.production.xml"
TARGET_DIR="$HOME/Library/Containers/com.microsoft.Word/Data/Documents/wef"
TARGET_FILE="$TARGET_DIR/manifest.production.xml"

fail() {
  printf '\nFEHLER: %s\n' "$1" >&2
  read -r -p "Enter drücken zum Schließen ..." || true
  exit 1
}

printf 'Footnote-Checker – macOS Beta-Installation\n'
[ -f "$MANIFEST_SOURCE" ] || fail "manifest.production.xml fehlt neben dem Script. Bitte das ZIP vollständig entpacken."
if pgrep -x "Microsoft Word" >/dev/null; then
  fail "Bitte Word mit Cmd+Q vollständig beenden und das Script erneut starten."
fi
if [ ! -d "$HOME/Library/Containers/com.microsoft.Word/Data/Documents" ]; then
  fail "Word-Ordner fehlt. Bitte Word einmal starten und vollständig beenden. Alternativ siehe INSTALLATION.md."
fi
mkdir -p "$TARGET_DIR"
if [ -f "$TARGET_FILE" ]; then
  BACKUP_FILE="$TARGET_FILE.backup-$(date +%Y%m%d-%H%M%S)-$$"
  cp "$TARGET_FILE" "$BACKUP_FILE"
  printf 'Vorhandenes Manifest gesichert: %s\n' "$BACKUP_FILE"
fi
cp "$MANIFEST_SOURCE" "$TARGET_FILE"
printf '\nInstallation abgeschlossen.\nManifest: %s\n' "$TARGET_FILE"
printf 'Word neu starten, Dokument öffnen und unter Start > Add-Ins den Footnote-Checker wählen.\n'
read -r -p "Enter drücken zum Schließen ..." || true
