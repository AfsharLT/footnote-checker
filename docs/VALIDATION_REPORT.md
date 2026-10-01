# FNC – Prüfbericht der lokalen Vorbereitung

1. Oktober 2026 · Repository `/Users/afsharshayesteh/Footnote Checker`.

| Prüfung | Ergebnis |
| --- | --- |
| npm run typecheck | Exit 0 |
| npm run lint | Exit 0 |
| npm test | Exit 0; alle 41 Testdateien bestanden, einschließlich Festschrift-Pinpoint und WorkOverrideEditor 17.3.2 |
| npm run build | Exit 0; Production-Build-Verifikation erfolgreich, Safari-15-Konfiguration erhalten |
| npm run validate | Exit 0 nach Netzwerkzugriff auf offiziellen Microsoft-Dienst |
| Produktionsmanifest: office-addin-manifest validate | Exit 0; gültiges Manifest |
| git diff --check | Exit 0 |
| Mac-Script: bash -n | Exit 0; Syntaxprüfung, kein Installationslauf |
| Mermaid-GitGraph | Parser erfolgreich; verwendete Commit-IDs als Vorfahren von HEAD verifiziert |
| README-Ziele | Lokale Datei-/Bildziele vorhanden; Remote-Downloadlinks werden erst nach Übernahme der Pakete nach main verfügbar |
| Pakete | ZIP-Integrität, Manifest- und Anleitungsgleichheit sowie SHA-256-Prüfsummen geprüft |
| Logo | Original bytegleich übernommen; 16/32/80-Pixel-Varianten erzeugt; ungenutztes hochauflösendes Original nicht im App-Build |

## Visuelle und echte Laufzeitprüfung

README-Kopf mit Logo, Farbband sowie gerenderter Mermaid-Graph in einer lokalen Browser-Vorschau angesehen. Der fertige Taskpane-Build wurde mit einem ausschließlich temporären Office-Platzhalter im Browser initialisiert. Das ist keine echte Word-Validierung. Vorschau-Dateien und Prüfwerkzeuge liegen ausschließlich unter /private/tmp und sind keine Projektabhängigkeiten.

Nicht durchgeführt: Word-Korrekturprüfung auf macOS/Windows, Ribbon-Darstellung im echten Word, ältere Host-Versionen, reale 1000+-Fußnoten-Dokumente und Ausführung der neuen Installer auf beiden Betriebssystemen. Das Windows-Script wurde statisch geprüft; ein PowerShell-/Windows-Ausführungstest ist noch nötig. Die Checkliste steht in RELEASE_PREPARATION.md.

## Verbleibende Befunde

Webpack meldet Größenwarnungen für das Taskpane-Bundle (590 KiB) und den zugehörigen Einstiegspunkt. Der Build und die Kompatibilitätsverifikation bestehen. Keine Abhängigkeit wurde für Branding hinzugefügt; die Logo-Größenvarianten werden im bestehenden Assetpfad ausgeliefert.

Der Checkout liegt auf `poc/17.2-source-registry`, letzter Commit `7ae0f63`. POC 17.3/17.3.2 sowie Branding und Dokumentation bleiben lokal uncommitted. Vorhandene POC-Änderungen wurden erhalten. Kein Staging, kein Commit, kein Push, kein PR, kein Deployment, keine Public-Schaltung.

Die Downloadpakete enthalten das Produktionsmanifest und laden den gehosteten Dienst; sie enthalten keinen eingefrorenen lokalen 17.3.2-Build. Für öffentliche Freigabe bleiben die fehlende LICENSE-Datei, verbindliche Datenschutzhinweise und Distributionsprüfung offen. Es wurde keine Lizenzentscheidung erfunden.

## Nachtrag: Commit und GitHub-Übernahme

Der Nutzer hat POC 17.3.2 einschließlich README, Installationsanleitung und Betapaketen als `a274652` committed und nach `origin/poc/17.2-source-registry` gepusht. Die zuvor zusätzlich geänderten Add-in-Farben und Word-Symbole sind zurückgenommen; das neue Logo bleibt ausschließlich für die README erhalten. Die oben dokumentierte lokale Vorbereitung ist ein historischer Prüfstand. Auf ausdrücklichen Nutzerauftrag wird der gepushte Stand nun nach `main` übernommen; ein Hosting-Deployment oder eine Public-Schaltung gehört nicht dazu. Echte Word-/Installertests werden durch diese Git-Übernahme nicht ersetzt.
