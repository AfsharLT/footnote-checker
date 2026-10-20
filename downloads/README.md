# Footnote-Checker – Downloads

**Mac-PKG 0.1.0 · Installationstest vom Nutzer am 21. Oktober 2026 bestätigt.** Unsignierte Mac-Beta für das eigene Benutzerkonto.

| Mac | Datei |
| --- | --- |
| Direkter Installer | [FootnoteChecker.pkg](FootnoteChecker.pkg) |
| Bebilderte Anleitung als PDF | [Installation auf macOS](Footnote-Checker-macOS-Installation.pdf) |
| Bebilderte Anleitung als HTML, offline nutzbar | [HTML herunterladen](Footnote-Checker-macOS-Installation.html) |
| Optionales Gesamtpaket | [Mac-ZIP mit PKG, PDF und HTML](Footnote-Checker-macOS-Beta.zip) |
| Nachweis | [Prüfsummen](SHA256SUMS.txt) · [Builddaten](FootnoteChecker.build.json) |

Das PKG ist **unsigniert und nicht notarisiert**. Falls Gatekeeper es blockiert, ist eine bewusste manuelle Freigabe für diese Datei nötig. Danach führt der normale macOS-Installer durch die Einrichtung. Für die Nutzer sind keine Terminaleingabe, kein `.command` und kein `chmod` erforderlich. Installation ausschließlich für das eigene Benutzerkonto; keine zusätzliche App unter „Programme“.

Das kleine PKG enthält die Installationslogik und das Produktionsmanifest, **keinen Anwendungsbuild**. Word lädt anschließend den gehosteten Dienst. Ein neues Paket oder Git-Push aktualisiert diesen Dienst nicht. [Schritt für Schritt mit Bildern](../docs/MACOS_INSTALLATION.md).

Das [Windows-ZIP](Footnote-Checker-Windows-Beta.zip) ist der bisherige Stand und wurde in dieser Mac-Überarbeitung nicht neu gebaut oder getestet.

## Für die Vorbereitung im Repository

- `python3 scripts/test-macos-pkg.py` prüft die Dateilogik ausschließlich in temporären Benutzerordnern. Kein Live-Profil wird installiert.
- `python3 scripts/build-macos-pkg.py` erzeugt/ersetzt nur das lokale PKG und dessen Builddaten. Keine Installation oder Veröffentlichung.
- `python3 scripts/build-macos-guide.py` erzeugt die lokale Markdown-, HTML- und PDF-Anleitung; benötigt ReportLab und die dokumentierten Bilder.
- `python3 scripts/package-beta.py --platform macos --reuse-pkg` prüft und bewahrt das bereits getestete PKG bytegleich und erzeugt nur Mac-ZIP und Prüfsummen neu. Ohne `--reuse-pkg` wird das PKG neu gebaut und muss erneut getestet werden. Das Windows-ZIP bleibt bytegleich. Erfolg: eingebettetes Manifest und ZIP-Inhalte sind verifiziert.

Prüfumfang und noch offene Plattform-/Gatekeeper-Szenarien stehen im [Validierungsbericht](../docs/MACOS_PKG_VALIDATION.md). Ein erfolgreicher lokaler Test ist keine Zusage für alle Word-/macOS-Versionen.
