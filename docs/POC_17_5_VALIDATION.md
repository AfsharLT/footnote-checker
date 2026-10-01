# POC 17.5 – lokale Umsetzung und Word-Prüfung

Stand: 1. Oktober 2026. Checkout: `/Users/afsharshayesteh/Footnote Checker`.
Der Implementierungslauf erfolgte ausschließlich lokal, ohne Commit, Push oder Deployment. Anschließend hat der Nutzer ausdrücklich Commit und Push autorisiert. Die unten aufgeführten realen Word-Prüfungen bleiben offen; dieser Commit dokumentiert eine implementierte, automatisiert geprüfte Version, keine bestätigte Word-Freigabe.

## Umsetzung

- Sofortige Startmeldung, anschließend verständliche Phasen für Lesen, Zusatzinformationen aus Word, Quellenerkennung, Quellenzuordnung, Regelprüfung und Ergebnisvorbereitung. Bei Korrektur folgen Planung, tatsächliche Korrekturen und Abschluss.
- Reader zählt vollständig verarbeitete 150er-Chunks. Parser zählt tatsächlich bearbeitete Fußnoten; Zuordnung und Regeln nennen ihre Einheiten ausdrücklich Prüfschritte. Leere Fußnoten bleiben im Accounting.
- Phasengewichtete Prozentanzeige: Lesen 0–60, Erkennung 60–72, Zuordnung 72–82, Regeln 82–95, Ergebnisvorbereitung 95–99, echte Fertigstellung 100. Im Korrekturmodus erhält die Analyse 85 Prozent des Gesamtfortschritts, danach zählen abgeschlossene Korrekturen bis 98 und die Finalisierung 99. Die Gewichte schätzen den Arbeitsanteil, keine Restdauer.
- Prozent und Zähler wachsen ausschließlich mit echten Prozesssignalen. Beim Warten bleiben Balkenanimation und Sekundenanzeige aktiv; nach acht Sekunden meldet die aktuelle Phase, dass sie länger dauert. Keine unhaltbare Garantie von +1 Prozent alle zwei Sekunden bei blockierendem Word. Bei reduzierten Animationen bleibt die Sekundenanzeige erhalten.
- Dieselbe Engine wird synchron von bisherigen Aufrufern und kooperativ/asynchron von der Oberfläche verwendet. Zwischen Verarbeitungseinheiten wird nach etwa 12 ms bzw. spätestens 100 Einheiten der Oberfläche Zeit gegeben. Fortschrittsmeldungen werden etwa alle 80 ms sowie an Phasengrenzen veröffentlicht. Einzelne bestehende Verarbeitungseinheiten/Word-Operationen sind nicht präemptiv unterbrechbar.
- Timer aktualisiert ausschließlich das kleine Fortschrittspanel. Abbruch/Unmount/Pagehide räumen Timer auf; die lokale Analyse wird abgebrochen, späte Analyse-/Korrekturfortschritte ignoriert. Bereits bei Word eingereichte Operationen lassen sich dadurch nicht rückgängig machen.
- Nach-oben-Button am rechten Rand des tatsächlichen Scrollcontainers, ab 180 Pixel Scrollposition. Er setzt Scrollposition und Tastaturfokus zur Kopfzeile; in allen drei Modi verfügbar. Laufendes Statuspanel bleibt beim Scrollen sichtbar.
- Weißer Seitenhintergrund, Petrol `#18313A` als Markenakzent, kleines Salbeigrün für Aktivität. Bestehende semantische Warn-/Fehlerfarben bleiben lesbar. Dezente innere 4-Pixel-Seitenkante. Die echte Breite und die Drag-Fläche zum Breiterziehen kontrolliert Word, nicht das Add-in.
- Original `assets/FNC_LOGO.png` unverändert. Daraus skalierte UI-Datei `fnc-logo-160.png` und Word-Icons `fnc-icon-16/32/80.png`. Veraltete Logobilder entfernt, XML-Referenzen umgestellt und Manifestversion auf `1.0.0.1` angehoben. Neue Dateinamen verhindern Vermischung mit gecachten alten Icon-URLs.
- `tsconfig.json`: unnötiges `baseUrl` entfernt, Alias explizit auf `./src/*`; VS Code verwendet die installierte Projekt-TypeScript-Version. Die ursprüngliche Editor-Markierung war nicht als Compilerfehler reproduzierbar; Typprüfung vor Änderung bereits erfolgreich. Bei fortbestehender Markierung VS Code-Fenster neu laden und Problems-Meldung prüfen.
- Einstellungen und Literaturverwaltung bleiben im lokalen Add-in-Speicher des jeweiligen Host-/Browserprofils. Sie können dort mehrere Dokumente betreffen; keine gemeinsame Einstellung auf dem Server.
- README und bestehende Download-ZIPs unverändert. Nach späterem Hosting-Release müssen Pakete mit dem neuen Produktionsmanifest neu erzeugt und überprüft werden; das bestehende gehostete Add-in hat weiterhin den bisherigen Stand.

## Prüfungen

- `npm run typecheck`: bestanden.
- `npm run lint`: bestanden.
- `npm test`: alle 42 Testdateien bestanden, einschließlich bestehender 17.3.2-Regressionen.
- `npm run build`: erfolgreich, einschließlich Produktions-/Safari15-Prüfung. Zwei bekannte Bundlegrößenwarnungen, Taskpane rund 595 KiB.
- `npm run validate`: Entwicklungsmanifest gültig.
- `npx --no-install office-addin-manifest validate manifest.production.xml`: Produktionsmanifest gültig. XML-Validierung belegt weder gehostete neue Icon-Dateien noch reales Word-Verhalten.
- `git diff --check`: bestanden.
- Neue Tests vergleichen fachliche Ergebnisse, Findings/IDs, Offsets, Quellenregister und Schutzbereiche zwischen synchroner und kooperativer Analyse bei 0/1/80/1200 Fußnoten; Laufzeiten werden dabei ausgeklammert. Abbruch, Fehler, Update-Drosselung, monotone Prozentwerte und Korrektur-Übergänge geprüft.
- Letzter vollständiger synthetischer 1200er-Vergleich: rund 228 ms, 7 Fortschrittsmeldungen, 76 Eventloop-Gelegenheiten; größte Lücke zwischen Meldungen 79 ms. Das ist CPU-Analyse mit lokalen Testdaten, keine Messung der Word-Lesezeit oder eine Garantie für fremde Rechner/Dokumente.
- Zusätzliche DOM-Prüfung: zugänglicher Fortschrittswert, simulierte 9-Sekunden-Wartephase ohne erfundene Prozentsteigerung, Cleanup bei Abschluss/Unmount.
- Browserprüfung mit echten UI-Komponenten und anonymen Testdaten: 320/400/520-Pixel-Ansichten ohne horizontalen Scrollüberlauf, Hintergrund weiß, neues Logo sichtbar; alle Modusansichten; Status bleibt beim Scrollen sichtbar; Nach-oben bringt den echten Scrollcontainer zurück auf 0 und fokussiert die Kopfzeile. Keine Word-Dokumente verändert.

## Noch durchzuführen: reales Word

Diese Prüfung ist noch offen und vor einer Freigabe auf macOS und Windows getrennt zu dokumentieren.

1. In VS Code den bestätigten Checkout öffnen und im Projektterminal `npm start` ausführen. Das startet die lokale Entwicklungsinstallation über `manifest.xml`, kann Entwicklungszertifikate einrichten und Word öffnen. Erfolg: das Add-in lädt von `https://localhost:3000`; die veröffentlichte/gehostete Installation zeigt diese lokalen Änderungen nicht. Mit `npm stop` wird diese Entwicklungsinstallation beendet.
2. Eine Dokumentkopie mit wenigen Fußnoten prüfen: Startmeldung unmittelbar sichtbar; tatsächliche Zahl stimmt; 100 erst bei vorhandenen Ergebnissen. Leeres Dokument ebenfalls prüfen.
3. Den echten 80er-Korpus und ein Dokument mit mindestens 1000 Fußnoten testen. Alle Phasen und sichtbare Aktivität beobachten; nichts bleibt ohne Statusmeldung. Prozent darf auf Word warten, Zähler darf keine unbearbeiteten Fußnoten als fertig nennen.
4. Analyse, Prüfung und Korrektur jeweils testen. Für Korrektur eine Kopie verwenden; vorhandene Sicherheitsentscheidungen dürfen sich nicht ändern. Übergang von Analyse zu Korrektur läuft ohne Rücksprung; Fehlermeldungen zeigen keinen fingierten 100-Prozent-Erfolg.
5. In der Ergebnisliste weit nach unten scrollen. Nach-oben per Maus und Tastatur testen; Einstellungen und Hauptaktion sind danach direkt erreichbar. Bei laufender Analyse bleibt die Statusanzeige sichtbar. Fensterbreiten variieren und prüfen, dass der Button nichts Wesentliches überdeckt.
6. Neues Symbol in Word prüfen. Falls Word das alte Symbol cached: die lokale Entwicklungsinstallation mit `npm stop` beenden, Word schließen und `npm start` erneut ausführen. Keine pauschale Cache-/Profilbereinigung nötig.
7. Eine Einstellung ändern, speichern, Add-in neu öffnen und lokales Fortbestehen prüfen. Ein unabhängiges Gerät/Profil darf dadurch keine Einstellung erhalten. Vor Cachebereinigung Einstellungen exportieren.
8. Bestehenden Literaturverzeichnis-Crash-Fix erneut prüfen. Hassemer/Hruschka separat dokumentieren: Der CTO-Chat meldet weiterhin fehlende echte Klammer-Findings. 17.5 erhält die bestehende Regellogik und gilt nicht als neuer fachlicher Festschrift-Fix.

## Dateien und nächste Schritte

Die Spezifikation liegt in `docs/POC_17_5_CODEX_PROMPT.txt`. Neue Kernteile: `src/footnote-engine/cooperative.ts`, `src/taskpane/loading-progress.ts`, `src/taskpane/components/LoadingProgress.tsx` sowie `tests/taskpane/loading-progress-17-5.test.ts`. Reader, Engine, Registry, Regelrunner, App, Workspace, Palette/BrandLogo, Manifeste und TypeScript-Konfiguration wurden entsprechend angeschlossen. `dist` wurde lokal neu gebaut, deshalb wechseln generierte Dateinamen und alte Build-Dateien verschwinden.

Der Nutzer hat nach der lokalen Umsetzung ausdrücklich Commit und Push des aktuellen Entwicklungszweigs autorisiert. Ein Deployment und eine Zusammenführung nach main sind damit in diesem Schritt nicht erfolgt. Reale Word-Prüfung und Ergebnisbewertung bleiben vor einer Produktfreigabe erforderlich.
