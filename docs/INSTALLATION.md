# Footnote-Checker installieren

FNC ist ein Word-Web-Add-in. Das **Manifest** ist die XML-Datei, mit der Word Name, Symbol, Berechtigungen und Webadresse des Add-ins kennt. Das Betapaket installiert diese Konfiguration; die Anwendung selbst lädt von `https://footnote-checker.shayesteh-afshar.workers.dev`.

## Voraussetzungen

- Word Desktop auf macOS oder Windows, mit erlaubten Office-Web-Add-ins.
- Internetzugang zum Hosting und zu Microsofts Office.js-Dienst.
- Auf verwalteten Geräten gegebenenfalls Freigabe durch die IT.
- Dokumentkopie für den ersten Test. Kein Node.js, VS Code oder lokaler Server für die Beta erforderlich.

Ältere Word-Versionen unterstützen manche Funktionen nur teilweise. Die bestehende Safari-15-/WebKit-Härtung ist keine Garantie für jede Word-Version. Bei Fehlern Version und Build aus **Word → Über Microsoft Word** beziehungsweise **Datei → Konto → Info zu Word** notieren.

## Paket auswählen

[macOS herunterladen](https://github.com/AfsharLT/footnote-checker/raw/refs/heads/main/downloads/Footnote-Checker-macOS-Beta.zip) · [Windows herunterladen](https://github.com/AfsharLT/footnote-checker/raw/refs/heads/main/downloads/Footnote-Checker-Windows-Beta.zip)

Download funktioniert nach Push der Paketdateien nach `main`; ein privates Repository erfordert Zugriff. ZIP vollständig entpacken. Scripts und `manifest.production.xml` müssen zusammen im jeweiligen Paketordner bleiben. Die Anleitung ist auch als `INSTALLATION.md` im ZIP enthalten. Prüfsummen stehen im Repository unter `downloads/SHA256SUMS.txt`.

## macOS

### Installation mit dem Mac-Script

1. Word einmal regulär starten, falls es frisch installiert ist, dann mit **⌘Q** vollständig beenden.
2. ZIP entpacken. `install-footnote-checker-mac.command` im Finder öffnen.
3. Die Ausgabe prüfen. Das Script kopiert `manifest.production.xml` nach:

   `~/Library/Containers/com.microsoft.Word/Data/Documents/wef/manifest.production.xml`

   Eine vorhandene gleichnamige Datei wird vor dem Ersetzen mit Zeitstempel gesichert. Das Script installiert keine zusätzliche Software, lädt keine Dateien herunter und benötigt kein `sudo`.
4. Erfolg: Terminal meldet **Installation abgeschlossen** und zeigt den Zielpfad.
5. Word neu starten, Dokument öffnen und unter **Start → Add-Ins** FNC auswählen. Je nach Version **Weitere Add-Ins / Meine Add-Ins** öffnen.
6. Auf einer Dokumentkopie zunächst **Analyse** ausführen, dann Settings und Literaturverzeichnis öffnen.

### Manuelle Installation ohne Script

1. Word beenden. Finder öffnen, **⇧⌘G** drücken.
2. `~/Library/Containers/com.microsoft.Word/Data/Documents` eingeben.
3. Falls nicht vorhanden, den Unterordner `wef` anlegen.
4. Die Datei `manifest.production.xml` aus dem Paket in `wef` kopieren. Eine bestehende gleichnamige Datei zunächst separat sichern.
5. Word erneut starten und FNC unter den Add-ins öffnen.

Dieser Weg benötigt keine Ausführung eines heruntergeladenen Scripts. Er folgt [Microsofts dokumentiertem Mac-Sideloading-Verfahren](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-an-office-add-in-on-mac).

### macOS-Probleme lösen

| Symptom | Vorgehen |
| --- | --- |
| „Entwickler kann nicht verifiziert werden“ | Manuelle Installation oben verwenden. Wenn du das Script aus diesem Projekt bewusst ausführen möchtest, nach dem blockierten Öffnungsversuch **Systemeinstellungen → Datenschutz & Sicherheit → Dennoch öffnen** prüfen. Das gewährt nur diesem Script eine Ausnahme; Gatekeeper nicht global deaktivieren. [Apple-Anleitung](https://support.apple.com/en-ie/102445). |
| Script lässt sich nicht ausführen / „Permission denied“ | Ausführungsrecht prüfen; siehe Befehl unten. |
| Manifest nicht gefunden | ZIP vollständig entpacken; XML und Script im selben Ordner belassen. |
| Kein Zugriff auf den Word-Ordner | Word einmal starten; reguläres Benutzerkonto verwenden. Bei verwalteten Geräten IT kontaktieren. Nicht mit `sudo` improvisieren. |
| Add-in erscheint nicht | Word wirklich mit ⌘Q beenden, XML-Zielpfad prüfen, Dokument öffnen und Add-in-Menü erneut aufrufen. |
| Leere Oberfläche / Ladefehler | Internetzugang und Hosting prüfen, Word neu starten. Screenshots und Word-Version dokumentieren; kein blindes Cache-Löschen. |
| Alter Stand bleibt sichtbar | Word komplett beenden und erneut starten. Prüfen, ob das Paket die Produktionsadresse enthält. Neuer lokaler Code erreicht die gehostete Beta erst nach Deployment. |

Falls nur das Ausführungsrecht fehlt: Terminal öffnen, `cd ` tippen, den entpackten Paketordner aus dem Finder ins Terminal ziehen und Enter drücken. Das wechselt nur den Arbeitsordner. Danach:

```bash
chmod u+x ./install-footnote-checker-mac.command
```

Ändert ausschließlich das Ausführungsrecht dieses Scripts für den eigenen Benutzer; es installiert noch nichts und ersetzt keine Gatekeeper-Freigabe. Erfolg: Das Script lässt sich starten. Zum bewussten Start aus diesem Ordner:

```bash
./install-footnote-checker-mac.command
```

Dieser zweite Befehl kopiert das Manifest und sichert eine vorhandene gleichnamige Datei. Erfolg: **Installation abgeschlossen**. Alternativ weiterhin die manuelle Installation verwenden.

### Entfernen oder Wiederherstellen

Word beenden. Nur die FNC-Datei `manifest.production.xml` aus `wef` entfernen beziehungsweise eine vor der Installation gesicherte Version zurückkopieren. Andere Add-in-Dateien belassen. Word neu starten. Bei weiterhin angezeigten Cache-Einträgen Microsofts [Cache-Anleitung](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/clear-cache) beachten; vorher FNC-Einstellungen exportieren und nicht den gesamten Word-Container löschen.

## Windows

### Installation mit dem Windows-Script

1. Word vollständig schließen. ZIP entpacken; `.bat`, `.ps1` und XML zusammen lassen.
2. `install-footnote-checker-windows.bat` als eigener Benutzer starten. Der Installer fordert bei Bedarf Administratorrechte an. Verwende **dasselbe Konto**, sonst werden Benutzerkatalog und Registry im falschen Profil eingerichtet. Ist nur ein anderes Admin-Konto verfügbar, IT beziehungsweise manuellen Weg nutzen.
3. Das Script erstellt `%LOCALAPPDATA%\FootnoteChecker\Catalog`, kopiert das Manifest mit Sicherung einer vorhandenen Datei und erstellt `FootnoteCheckerCatalog` als Freigabe mit Lesezugriff für das eigene Konto.
4. Der Office-Katalog wird in der Benutzer-Registry unter `HKCU\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs` registriert. Erfolg: Der Installer zeigt den Katalogpfad `\\COMPUTERNAME\FootnoteCheckerCatalog`.
5. Word neu starten → **Start → Add-Ins → Erweitert → Freigegebener Ordner / Shared Folder** → **Footnote-Checker → Hinzufügen**.

Der Starter verwendet eine PowerShell-Ausnahme nur für diesen Prozess; er ändert keine dauerhafte Execution Policy. Organisationsrichtlinien können den Start dennoch verhindern. Keine Richtlinien oder Schutzfunktionen global deaktivieren.

### Manueller Katalogweg

Bei gesperrtem Script einen von der IT zugelassenen Freigabeordner verwenden. XML dort ablegen, Freigabe nur für die benötigten Benutzer erteilen. In Word **Datei → Optionen → Trust Center → Einstellungen für das Trust Center → Vertrauenswürdige Add-in-Kataloge** öffnen. Netzwerkpfad (UNC, zum Beispiel `\\PC\FNC-Katalog`) als Katalog hinzufügen, **Im Menü anzeigen** aktivieren, Word neu starten und über **Freigegebener Ordner** installieren. Details: [Microsofts Windows-Testverfahren](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins).

Dieser Katalogweg dient Beta-Tests; er ersetzt keine öffentliche Marketplace-Verteilung.

### Windows-Probleme lösen

- **Administratorabfrage mit anderem Konto:** Abbrechen; die IT soll den Katalog für das richtige Nutzerprofil konfigurieren.
- **PowerShell gesperrt:** Organisationseinstellungen durch IT prüfen lassen; keine pauschale Policy-Änderung.
- **Freigabe nicht erreichbar:** Angezeigten UNC-Pfad im Explorer prüfen; IT prüft Freigabe-/Firewallrichtlinien.
- **Vorhandene Freigabe kollidiert:** Der Installer bricht bei fremdem Pfad oder zusätzlichen Freigabeberechtigungen ab und verändert diese Freigabe nicht. IT klärt den Konflikt.
- **Freigegebener Ordner fehlt:** Katalogeintrag und „Im Menü anzeigen“ prüfen; Word neu starten.
- **Ladefehler:** Hosting/Proxy, Word-Build und Version des Word-internen Browsers (WebView) erfassen. Keine ungezielte Neuinstallation aller Office-Komponenten.

### Entfernen

Nur FNC aus den Add-ins und den FNC-Katalog aus den vertrauenswürdigen Add-in-Katalogen entfernen. Der lokale Katalogordner und die Freigabe können nach Prüfung durch den Benutzer beziehungsweise die IT entfernt werden, sofern sie ausschließlich FNC dienen. Keine fremden Kataloge oder Freigaben löschen.

## Erster Funktionstest und Updates

1. Dokumentkopie mit wenigen Fußnoten öffnen.
2. Analyse starten: Befunde erscheinen, Text bleibt unverändert.
3. Einstellungen und Literaturverzeichnis öffnen und einen eigenen Testwert speichern.
4. Eine sichere Korrektur bewusst übernehmen, Word-Text kontrollieren und erneut analysieren.
5. Erst anschließend größere Dokumente prüfen.

Die Pakete installieren **keinen eingefrorenen 17.3.2-Build**. Sie zeigen die jeweils gehostete Version. Für reine Webcode-Updates bei unverändertem Manifest normalerweise Word beenden und neu starten. Bei Änderungen am Manifest oder Ribbon ist eine Aktualisierung der Installation erforderlich.

Probleme melden: Betriebssystem, Word-Version/Build, Paket, Schritte, Fehlermeldung und anonymisierten Beispielbeleg. Keine vertraulichen Dokumente in öffentliche Issues stellen.
