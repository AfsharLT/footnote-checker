# Footnote-Checker installieren

FNC ist ein Word-Web-Add-in. Das **Manifest** ist die XML-Datei, mit der Word Name, Symbol, Berechtigungen und Webadresse des Add-ins kennt. Das Betapaket installiert diese Konfiguration; die Anwendung selbst lädt von `https://footnote-checker.shayesteh-afshar.workers.dev`.

## Voraussetzungen

- Word Desktop auf macOS oder Windows, mit erlaubten Office-Web-Add-ins.
- Internetzugang zum Hosting und zu Microsofts Office.js-Dienst.
- Auf verwalteten Geräten gegebenenfalls Freigabe durch die IT.
- Dokumentkopie für den ersten Test. Kein Node.js, VS Code oder lokaler Server für die Beta erforderlich.

Ältere Word-Versionen unterstützen manche Funktionen nur teilweise. Die bestehende Safari-15-/WebKit-Härtung ist keine Garantie für jede Word-Version. Bei Fehlern Version und Build aus **Word → Über Microsoft Word** beziehungsweise **Datei → Konto → Info zu Word** notieren.

## Paket auswählen

**Mac:** [FootnoteChecker.pkg](../downloads/FootnoteChecker.pkg) · [Bebilderte Anleitung](MACOS_INSTALLATION.md) · [PDF](../downloads/Footnote-Checker-macOS-Installation.pdf) · [Offline-HTML](../downloads/Footnote-Checker-macOS-Installation.html).

**Windows:** [Bisheriges Windows-ZIP](https://github.com/AfsharLT/footnote-checker/raw/refs/heads/main/downloads/Footnote-Checker-Windows-Beta.zip). Diesen Stand haben wir bei der Mac-Überarbeitung nicht verändert.

Der lokale Mac-PKG-Installationstest wurde vom Nutzer am 21. Oktober 2026 bestätigt. Das Paket ist unsigniert und nicht notarisiert. Die Downloads richten das Produktionsmanifest ein; sie aktualisieren nicht den gehosteten Dienst.

## macOS

### Neuer Standardweg: normaler PKG-Installer

1. Word einmal regulär öffnen, falls es frisch installiert ist. Dokumente speichern und Word mit **Cmd+Q** vollständig beenden.
2. **FootnoteChecker.pkg** doppelt anklicken. Kein Terminal, kein `.command`, kein `chmod`.
3. Falls Gatekeeper blockiert: **Systemeinstellungen → Datenschutz & Sicherheit → Sicherheit → Dennoch öffnen** für genau dieses Paket wählen; eine etwaige macOS-Bestätigung und die erneute Rückfrage mit **Öffnen** bestätigen. Das Paket ist derzeit unsigniert und nicht notarisiert. Kein globales Deaktivieren von Gatekeeper. [Apple-Anleitung](https://support.apple.com/de-de/102445).
4. **Fortfahren → Fortfahren → Installieren**. Falls die Zielauswahl erscheint: **Nur für mich installieren**. Der Installer fordert bei laufendem Word regulär zum Schließen auf; vorher Dokumente sichern.
5. Erfolgsmeldung abwarten, **Schließen**, Word starten und ein Dokument öffnen. Unter **Start → Add-Ins** den Footnote-Checker wählen.
6. Auf einer Dokumentkopie zuerst **Analyse** testen.

[Alle Schritte, echte Installer-Screenshots und Hilfe bei Fehlern](MACOS_INSTALLATION.md). Die Anleitung steht auch als [PDF](../downloads/Footnote-Checker-macOS-Installation.pdf) und [eigenständiges HTML](../downloads/Footnote-Checker-macOS-Installation.html) bereit.

### Was der Installer ändert

Er installiert ausschließlich für das aktuelle Benutzerkonto nach `~/Library/Containers/com.microsoft.Word/Data/Documents/wef/manifest.production.xml`. Geänderte ältere FNC-Dateien werden unter `~/Library/Application Support/Footnote-Checker/Installer Backups/` gesichert. Identische Neuinstallationen erzeugen keine zusätzlichen Backups. Andere Add-ins und lokale FNC-Einstellungen werden nicht verändert. Die benutzerbezogene Installation benötigt planmäßig keine Administratorrechte; Gatekeeper oder andere macOS-Freigaben können dennoch eine eigene Bestätigung zeigen.

### macOS-Probleme lösen

Siehe [Probleme und Lösungen ohne Terminal](MACOS_INSTALLATION.md#wenn-etwas-nicht-klappt). Fehlt der Word-Ordner, Word einmal starten und beenden. Bei gesperrten Add-ins oder fehlender Gatekeeper-Freigabeoption die IT einbeziehen. Keine Systemschutzfunktionen oder Unternehmensrichtlinien umgehen.

### Entfernen oder Wiederherstellen

Word beenden. Im Finder über **Gehe zu → Gehe zum Ordner** den oben genannten `wef`-Ordner öffnen und nur die FNC-Datei entfernen oder eine gesicherte Version zurückkopieren. Andere Add-in-Dateien belassen. Vor Cachebereinigung FNC-Einstellungen exportieren und niemals den gesamten Word-Container löschen. Der frühere `.command`-Installer bleibt nur als historischer Entwickler-Fallback im Repository; er ist nicht mehr Teil des neuen Mac-Pakets.

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
