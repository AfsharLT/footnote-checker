# Mac-PKG – Validierungs- und Freigabestand

Stand: **21. Oktober 2026**. Installer-Version **0.1.0**, Paket-ID `de.footnote-checker.word-addin.macos`. Am 17. Oktober aus Basis-Codestand `221c5f7` erstellt. Der Nutzer hat am 21. Oktober den lokalen Test bestätigt und ausdrücklich Commit, Push und Aktualisierung der Downloads/Anleitung freigegeben.

Das getestete PKG bleibt bytegleich (SHA-256 `c9a223c3705b82a68742f71fb5488e97f0bee7a3deac5fb933cebe687ecc7f18`). Nur Anleitung, Screenshots, Build-/Freigabemetadaten, ZIP und Prüfsummen werden erneuert. Keine erneute Installation im Nutzerprofil durch den Agenten und kein Hosting-Deployment.

## Was fertig vorbereitet ist

- `downloads/FootnoteChecker.pkg`: echter unsignierter und nicht notarisierter macOS-Installer, mit Apples `pkgbuild` und `productbuild` erzeugt.
- Ausschließlich Installationsdomäne `CurrentUserHomeDirectory`. Native Installer-Vorschau bestätigt Installation im aktuellen Benutzerordner. Kein Root-/System-Domain-Ziel und kein Umweg über ein zusätzliches Programm.
- Normale Einführung, kurze Hinweise, Installation und Abschlussanleitung. Installer-native Aufforderung, Microsoft Word vor dem Installieren zu schließen (`must-close`). Kein erzwungenes Beenden ungespeicherter Dokumente.
- Eingebettetes Produktionsmanifest bytegleich zur Repository-Datei, identische Office-Add-in-ID und Hostingadresse. Das Paket enthält keinen Engine-Build; die Installer-Version ist keine App-/POC-Version.
- Unprivilegierte Installationsskripte, Erkennung des installierenden Kontos über dessen Benutzer-ID/Directory Service. Root-Ausführung wird ausdrücklich abgewiesen; keine Ableitung aus einem möglicherweise fremden Administrator-Home.
- Vorprüfung: Word installiert, für dieses Konto initialisiert und beendet; sichere Ziel-/Backup-Pfade. Atomarer Austausch, bytegenaue Sicherung einer geänderten alten FNC-Datei, identische Neuinstallation ohne zusätzliche Sicherung. Fremde Manifest-ID und symbolische Verknüpfungen werden nicht überschrieben. Andere Add-ins und lokale FNC-Einstellungen werden nicht verändert.
- GitHub-README, Downloadseite und generelle Anleitung auf den neuen Mac-PKG-Weg umgestellt. Detailanleitung mit drei am 21. Oktober frisch aufgenommenen echten Installer-Screenshots, Word-Beispiel und beschrifteter Gatekeeper-Orientierungsgrafik. PDF und selbstständiges HTML sind herunterladbar vorbereitet.
- Optionales Mac-ZIP enthält ausschließlich PKG, PDF-/HTML-Anleitung, Builddaten und Prüfsummen. Kein `.command`, kein loses Manifest und kein Nutzer-`chmod`. Das Windows-ZIP wurde bytegleich zum Git-Stand belassen.

## Tatsächlich geprüft

1. `python3 scripts/test-macos-pkg.py`: alle isolierten Dateilogiktests erfolgreich. Neuinstallation, Leerzeichen im Pfad, Dateimodus/Bytes, idempotente Wiederholung, Update/Backup, fremde Add-ins, ungültige Quelle, fremde Ziel-ID, symbolische Datei-/Ordnerverknüpfung, fehlender Word-Ordner und blockierter Backup-Pfad. Kein echtes Word-Profil verwendet.
2. Shell-Syntax aller vier Installer-Skriptdateien geprüft.
3. Paket mit `pkgutil --expand-full` entpackt: eingebettete Manifestbytes und die ausschließlich benutzerbezogene Distribution verifiziert.
4. `pkgutil --check-signature`: erwarteter Status **no signature**. Keine Signierung/Notarisierung vorgetäuscht.
5. `installer -pkg downloads/FootnoteChecker.pkg -dominfo`: ausschließlich **CurrentUserHomeDirectory**.
6. Echter macOS-Installer bis zur Installieren-Schaltfläche geöffnet und geprüft. Einführung/Hinweise und native Standardinstallation im Benutzerordner funktionieren. Screenshots stammen aus dieser Vorschau. Die abschließende Installieren-Schaltfläche wurde nicht ausgelöst und das Fenster wieder geschlossen.
7. ZIP entpackt/verifiziert; kein `.command` im neuen Mac-Paket. SHA-256 aller neuen Downloads geprüft; Windows-ZIP unverändert.
8. Fünf aktualisierte PDF-Seiten gerendert und visuell geprüft. Markdown-/HTML-Bilder lokal vorhanden, PDF/HTML mit der Anleitung und tatsächlichen Screenshots erzeugt.
9. `git diff --check` ohne Fehler. Keine Änderungen an Engine, Word-Reader, Hosting, Windows-Installern oder Sicherheitsrichtlinien.

## Nutzerbestätigung und neue Aufnahmen vom 21. Oktober

Der Nutzer hat „Okay, hab’s getestet“ mit anschließender Veröffentlichungsfreigabe mitgeteilt. Dies wird als bestätigter lokaler Installer-Test festgehalten. Betriebssystem-/Word-Build sowie einzelne Gatekeeper-, Update- und Wiederholungsszenarien wurden dabei nicht separat berichtet. Die ursprüngliche Vorschau ist kein unabhängiger Nachweis dieser Einzelschritte.

Drei neue Screenshots wurden direkt im echten Installer erstellt: Einführung, Hinweisseite und Installationstyp. Das Abschlussfenster des Nutzertests war nicht mehr geöffnet. Es wurde deshalb weder eine erneute Installation vorgenommen noch eine Erfolgsmeldung nachgestellt. Die Vorschaufenster wurden anschließend geschlossen.

Die Workflow-Architektur wurde in der lokalen Draw.io-App geöffnet, visuell geprüft und als SVG sowie hochauflösendes PNG exportiert. `docs/technical-workflow.drawio` ist die bearbeitbare Quelle. Das PNG dient der verlässlichen Darstellung in GitHub; alle drei Analyse-Module und die Review-/Write-back-Verzweigung sind enthalten.

## Weiterhin nicht separat nachgewiesen

- Browserdownload mit Quarantäne/Gatekeeper auf einem weiteren Mac. Die Gatekeeper-Grafik bleibt eine beschriftete Orientierung, kein behaupteter Screenshot einer Freigabewarnung.
- Echte Update-/Wiederholungsinstallation mit Backup, verschiedene Benutzerkonten, Intel-Mac und verwaltete Geräte. Die isolierten Dateitests sind erfolgreich; der Nutzerbericht nennt diese Szenarien nicht einzeln.
- Am 17. Oktober wurde eine reine HTTP-Prüfung des konfigurierten Taskpanes mit **403** abgewiesen. Ursache nicht bestimmt. Eine neue PKG-Veröffentlichung verändert den Dienst nicht; kein Hosting-Deployment durchgeführt. Der Nutzerbericht wird nicht als unabhängig protokollierte Hosting-/Word-Funktionsmessung ausgegeben.
- Andere macOS-/Word-Versionen wurden nicht real getestet. Das Paket erlaubt arm64/x86_64 und enthält keine architekturspezifischen Programme; dies ersetzt keinen Plattformtest.

## Manueller Test – ohne Terminal

1. Die lokale `downloads/FootnoteChecker.pkg` verwenden. Dokumente speichern und Word mit Cmd+Q beenden.
2. PKG öffnen, bei einer Gatekeeper-Warnung die bewusste Dateifreigabe laut [bebilderter Anleitung](MACOS_INSTALLATION.md) durchführen. Die normale Benutzerkonto-Installation wählen.
3. Bis zur Erfolgsmeldung installieren. Ggf. von macOS ausdrücklich verlangten Dateizugriff prüfen. Keine Terminalbefehle oder globale Schutzänderungen.
4. Word öffnen, Dokument laden, FNC über das Add-in-Menü starten. Oberfläche muss tatsächlich laden. Dokumentkopie analysieren und Einstellungen/Literaturverzeichnis öffnen.
5. Word wieder beenden und dasselbe PKG erneut installieren. Identische Datei darf keine neue Backup-Flut erzeugen. Für einen echten Upgrade-Test vorherige FNC-Version verwenden und die gesicherte Manifest-Datei im Finder prüfen. Andere Add-ins müssen erhalten bleiben.
6. Nach dem Paket-/Dokumenttest das jeweilige Fenster schließen, bevor ein weiteres Testfenster geöffnet wird.

## Veröffentlichungsprozess und spätere Updates

Die Nutzerfreigabe für Commit/Push liegt vor. Für diesen Stand gilt:

1. Anleitung und neue Screenshots erzeugen; das bestätigte PKG beibehalten.
2. `python3 scripts/test-macos-pkg.py` prüft die Dateilogik ausschließlich in temporären Ordnern. Kein echtes Benutzerprofil wird installiert.
3. `python3 scripts/package-beta.py --platform macos --reuse-pkg` verifiziert Paket-Hash, Manifest und die tatsächlich eingebetteten Skripte. Bei jeder Abweichung wird abgebrochen. Bei Erfolg werden nur ZIP und Prüfsummen aktualisiert; das getestete PKG bleibt unverändert. Das Windows-ZIP bleibt bytegleich.
4. Nach Link-/Bild-/PDF-Prüfung README, PKG, Anleitungen, Screenshots, Quellen und Prüfsummen committen und auf GitHub-main bereitstellen. Ein bereits existierendes altes Release-Asset wird durch einen Git-Push nicht ausgetauscht; die README verlinkt ausdrücklich die aktuellen Dateien auf main.
5. Bei einer künftigen Änderung der Installer-Logik oder des Manifests das PKG neu bauen und erneut testen. Ein vollständiger Neubau verändert den Paket-Hash und darf nicht still als identisches getestetes Paket ausgegeben werden.
6. Hosting-Deployment und ein neues GitHub-Release bleiben separate Schritte. Dieser Durchlauf veröffentlicht ausschließlich die freigegebenen Repository-Dateien.

## Architektur und Quellen

Apple beschreibt die Home-Domain als Installation im eigenen Konto ohne Root-Rechte: [Distribution XML Reference](https://developer.apple.com/library/archive/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html). Die benutzerbezogene Scripts-Paketstruktur entspricht auch der veröffentlichten [GIMP-Paketdokumentation](https://developer.gimp.org/resource/distributing-plug-ins/macos-plugin-publishing/). Word-Zielpfad und Neustart: [Microsofts Mac-Sideloading](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-an-office-add-in-on-mac). Die manuelle Ausnahme für bewusst bezogene unsignierte Software beschreibt [Apple](https://support.apple.com/de-de/102445).

Langfristig kann dasselbe PKG nach Apple-Developer-Enrollment mit einem Developer-ID-Installer-Zertifikat signiert und notarisiert werden. Es wurde hierfür weder ein Konto erstellt noch eine Mitgliedschaft gekauft oder eine Sicherheitsfunktion deaktiviert.
