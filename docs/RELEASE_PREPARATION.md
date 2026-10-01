# FNC – lokale Vorbereitung für Beta und GitHub

Stand: 1. Oktober 2026. Arbeitsrepository: `/Users/afsharshayesteh/Footnote Checker`.

## Belegte Ausgangslage

- `origin`: `https://github.com/AfsharLT/footnote-checker.git`.
- Aktueller Branch: `poc/17.2-source-registry`. Die README-Downloadlinks zielen auf `main`; ein Push nur in den aktuellen Branch aktiviert diese Links noch nicht. Änderungen erst regulär nach `main` übernehmen.
- Letzter vorhandener Commit: `7ae0f63` (POC 17.2).
- Chronologie: `556238c` (17.1), `bd25554` (vorgezogenes 17.4), `7ae0f63` (17.2).
- POC 17.3/17.3.2 liegen als lokale Änderungen vor. Tests für Festschrift-Pinpoint und WorkOverrideEditor sind vorhanden. Die README behauptet keinen bereits vorhandenen 17.3.2-Commit.
- Der ältere Ordner unter Documents/Arbeit/.../Building Add-On/Footnote Checker endet bei POC 15 und wird nicht bearbeitet.

## In dieser Vorbereitung geändert

- Original `FNC_LOGO.png` unverändert in `assets/`; das Original bleibt für die README im Repository und wird nicht unnötig ins Add-in-Build kopiert; daraus technische Größenvarianten für die bestehenden Ribbon-/Taskpane-Pfade 16/32/80 Pixel.
- Petrol `#18313A`, Papierweiß `#F7F4EC`, Salbeigrün `#43B7A3` und sparsam Korall `#E88B72` in den UI-Styles und im Fluent-Theme. Text bleibt kontrastreich; Fehler behalten ihre erkennbare Fehlerfarbe.
- Produktname Footnote-Checker, Manifest-Beschreibung, Provider/Supportdaten und korrekte Hosting-Domain statt Contoso-Platzhaltern. Add-in-ID, Berechtigungen und Produktionsadresse bleiben erhalten.
- README, textbasierte Installationsanleitung, GitGraph aus belegten Commits.
- Betapaketquellen und reproduzierbare ZIP-Erzeugung mit Prüfsummen. Mac sichert das vorherige Manifest; Windows prüft Konto- und Freigabekonflikte.
- npm-Paketname/Repository-Metadaten berichtigt; Abhängigkeitsversionen unverändert.

## Prüfen vor Commit und öffentlicher Freigabe

### Automatisiert

Im Repository ausführen:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run validate
npx --no-install office-addin-manifest validate manifest.production.xml
git diff --check
python3 scripts/package-beta.py
```

Die ersten Checks prüfen Code, Tests, Build, Manifeste und Whitespace. Mapping-Generierung und Build schreiben generierte Dateien. Die Paket-Erzeugung schreibt ausschließlich `downloads/`: ZIPs, Prüfsummen und Paketindex. Sie führt die Installer nicht aus. Erfolg: Exit-Code 0; ZIP-Manifest ist identisch mit `manifest.production.xml`. Manifeste und ZIPs nach weiteren Änderungen neu erzeugen.

### Echter Word-Test für 17.3.2

- [ ] macOS Word-Version/Build festhalten; Kopie des Testdokuments nutzen.
- [ ] `Hassemer, Festschrift für Bockelmann, 1979, S. 225, 239 ff.` bei aktivierter Klammer-Einstellung: genau ein passender Vorschlag → `Hassemer, Festschrift für Bockelmann, 1979, S. 225 (239 ff.)`.
- [ ] Korrektur übernehmen: Nachbarquellen, Formatierung und `ff.` bleiben erhalten; erneute Analyse erzeugt keinen Wiederholungsbefund.
- [ ] Einstellung auf Komma: keine Klammerkorrektur; schon korrekter Beleg und einzelne Startseite bleiben unverändert.
- [ ] Literaturverzeichnis ohne eigenen Werk-Override öffnen: kein Crash und keine Änderung allein durch Öffnen.
- [ ] Werk-Einstellung ändern, speichern, erneut öffnen; auf Vererbung zurücksetzen, erneut laden.
- [ ] Windows Word: dieselben Fälle prüfen; ältere unterstützte Hosts, soweit verfügbar.
- [ ] Dokument mit 1000+ Fußnoten: Laufzeit mit bisheriger Baseline vergleichen, keine verlorenen Quellen oder blockierte Oberfläche.

### Neuer Installer und Markenauftritt

- [ ] Mac-ZIP wirklich herunterladen und entpacken, nicht nur lokale Quelldatei testen.
- [ ] Script- und manuelle Finder-Installation testen; vorhandenes Manifest wird gesichert.
- [ ] Windows-ZIP auf Windows testen: eigener Benutzer, gleiches Konto bei Elevation, Freigabe, Registry und Word-Menü.
- [ ] Ablehnung bei anderem Admin-Konto und kollidierendem Freigabepfad kontrollieren.
- [ ] Logo in Word-Ribbon, Taskpane und Settings kontrollieren; 16-Pixel-Symbol lesbar, keine Stretching-Artefakte.
- [ ] Schmale Taskpane, Tastaturfokus, Textkontrast und Statusfarben prüfen.
- [ ] README auf GitHub: Logo, Farbstreifen, Mermaid und beide Downloadlinks funktionieren nach Push.

### Öffentliche Distribution

Konkrete noch offene Punkte im Ausgangsrepository:

- [ ] Lizenz festlegen und eine passende `LICENSE`-Datei ergänzen. `package.json` enthält bereits ein MIT-Feld aus dem Template; allein daraus wurde keine neue Lizenzdatei erzeugt.
- [ ] Verbindliche Datenschutzhinweise, Supportzuständigkeit und Nutzungsbedingungen soweit erforderlich finalisieren.
- [ ] Legacy-Mapping und verwendete Assets auf Veröffentlichungsrechte prüfen; öffentliche Freigabe des Repository-Inhalts bewusst entscheiden.
- [ ] Getrackte Build-Dateien enthalten Source Maps. Vor Public-Schaltung entscheiden, ob deren Veröffentlichung gewünscht ist.
- [ ] Ungenutztes `manifest.json` stammt noch aus dem ursprünglichen Template; Beta-Pakete verwenden ausschließlich `manifest.production.xml`. Ein späterer Unified-Manifest-/Marketplace-Weg ist eine separate Aufgabe.

Microsoft beschreibt den Windows-Freigabekatalog ausdrücklich als Testverfahren. Diese Pakete werden als Beta bereitgestellt; keine Behauptung einer Marketplace-Freigabe oder Apple-Notarisierung.

## Git, Hosting und Paketversion auseinanderhalten

Ein Git-Commit veröffentlicht keinen Cloudflare-Build. Die Betapakete enthalten nur das Manifest und zeigen die **jeweils gehostete Anwendung**, keinen fest eingebauten 17.3.2-Code.

Nach erfolgreicher lokaler Word-Validierung den Diff einschließlich bereits vorhandener 17.3.2-Änderungen prüfen und nur gewünschte Dateien stagen. Commit und Push erfolgen durch den Nutzer. Ein späteres Deployment ist ein eigener Schritt; anschließend die gehostete Version erneut in Word prüfen. Die tatsächliche Commit-ID dann in README/GitGraph ergänzen.

Bei dieser Vorbereitung: **kein Staging, kein Commit, kein Push, kein Deployment, keine Änderung der Repository-Sichtbarkeit.**

## Nachtrag: Commit und GitHub-Übernahme

Der Nutzer hat POC 17.3.2 einschließlich README, Installationsanleitung und Betapaketen als `a274652` committed und nach `origin/poc/17.2-source-registry` gepusht. Die zuvor zusätzlich geänderten Add-in-Farben und Word-Symbole sind zurückgenommen; das neue Logo bleibt ausschließlich für die README erhalten. Die oben dokumentierte lokale Vorbereitung ist ein historischer Prüfstand. Auf ausdrücklichen Nutzerauftrag wird der gepushte Stand nun nach `main` übernommen; ein Hosting-Deployment oder eine Public-Schaltung gehört nicht dazu. Echte Word-/Installertests werden durch diese Git-Übernahme nicht ersetzt.
