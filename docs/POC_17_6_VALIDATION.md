# POC 17.6 – Word-Navigation und lokale Validierung

Word-Validierung: 2. Oktober 2026. Commit und Push wurden am 3. Oktober 2026 ausdrücklich freigegeben. Kein Deployment oder Release für POC 17.6.

## Umsetzung

- Expliziter Button „Zur Fußnote“ für die zuletzt aufgeklappte, noch aktive Fußnote. Aufklappen allein verändert die Word-Auswahl nicht. Ohne aktives Ziel deaktiviert; beim Schließen oder Verlassen der Ansicht wird das Ziel aufgehoben.
- Analyse-, Prüfungs- und Korrekturmodus; während Lesen, Korrektur oder einer laufenden Navigation gesperrt. Bestehende App-Guards verhindern parallele Word-Aufrufe zwischen diesen Aktionen.
- Weiß/Petrol, Tastaturbedienung, verständliche lokale Statusmeldungen. Keine technischen Hostfehlermeldungen im normalen Ablauf. Sticky-Navigation bleibt beim Scrollen sichtbar. Im ersten Real-Word-Durchlauf verdeckte die abgeschlossene Fortschrittsanzeige den Button; anschließend behoben und erneut visuell geprüft. Höhenbeobachtung ohne zusätzliche React-Updates, mit Fallback für WebViews ohne ResizeObserver.
- Vor dem Sprung: gleiche Anzahl und Reihenfolge der Footnote-Snapshots, vollständiger aktueller Zieltext und beide normalisierten Referenzkontexte. Identischer Text mit identischem Kontext wird als mehrdeutig blockiert. Keine globale Suche und keine heuristische Umzuordnung.
- Bekannte eigene Textkorrekturen werden in Reihenfolge nachgerechnet; unbekannte Text-/Kontextänderungen führen zur Aufforderung, neu zu analysieren.
- Nur Auswahl ändern, keine Bookmark-/Dokument-/Formatierungsänderung durch Navigation. Vier konstante Synchronisierungen pro erfolgreichem expliziten Sprung, nur Zieltext und Zielkontext laden; keine persistenten Word-Proxies. Anschließend prüft der Adapter die tatsächliche Auswahl: Fußnoten-Body und vollständiger Text müssen stimmen. Ein Host-Fehler bleibt lokal; Analyse weiter verfügbar.

## Realer Word-Test

Microsoft Word für macOS **16.103.3**, Build **16.103.25113013**. Lokales Add-in von `https://localhost:3000`.

Dokument: eine Kopie von „Test Add Inn.docx“, ausschließlich lokal unter `/private/tmp/FNC-17.6-Word-Test.docx`. Das Original wurde nicht bearbeitet und nicht ins Repository aufgenommen. Original-SHA256: `f09d76b69afacc57a3a837492f4bd63940d5e6330441eed3d78b6da127fb8dfd`.

- Alle **80 Fußnoten** vollständig als Text eingelesen und in der Ergebnisliste vorhanden. Baseline: **308 Prüfhinweise** (299 automatisch klassifiziert, 9 manuell), vor Änderungen in der Testkopie.
- Fußnoten **1 bis 80 einzeln aufgeklappt, zu jeder navigiert und die bestätigte Word-Auswahl geprüft**. Alle 80 erfolgreich. Zwischenstände zusätzlich visuell kontrolliert, insbesondere 1, 41 und 80.
- Wiederholter identischer Manuskripttext in 24/25 sowie andere gleichlautende Kurzbelege: jeweils korrekte Zielnote dank Referenzkontext.
- Nachträgliche Testeingabe in Fußnote 80: Navigation mit Aufforderung zur erneuten Prüfung blockiert. Testeingabe vollständig per Words Rückgängig-Funktion entfernt; anschließend Navigation wieder erfolgreich.
- Prüfungsmodus: Navigation zu 80 erfolgreich. Einzelkorrektur zu BGHSt in 1 akzeptiert und durchgeführt: `BGHSt. 5, 245, 248` → `BGHSt. 5, 245 (248)`. Danach Navigation zu 1 ohne Neuanalyse erfolgreich; bekannte Mutation berücksichtigt. Auch im Korrekturmodus Navigation zu 1 bestätigt.
- Nach-oben-Button bringt die Ergebnisliste zur Kopfzeile und verschwindet. Einstellungen, Literaturverzeichnis und bestehender Quelleneditor öffnen ohne `override.formatting`-Crash. Rückkehr zur Ergebnisansicht: kein aktives Ziel, Navigation deaktiviert.

## Fachliche Befundkontrolle und Grenzen

Die folgende Tabelle dokumentiert für **jede einzelne Fußnote** den sichtbaren Befundumfang und den echten Navigationstest. Sie belegt vollständige Bilanzierung und sichere Navigation; sie ist kein vollständiger fachlicher Goldstandard für jede Zitierweise.

- BGHSt-Fundstelle in 1 und RGSt-Fundstelle in 65: erwarteter Klammerhinweis sichtbar. BGHSt zusätzlich tatsächlich korrigiert, ausschließlich in der Kopie.
- Hassemer in 3 und Hruschka in 4: bekannte fehlende Festschrift-Klammerhinweise im echten Dokument weiterhin reproduzierbar. Nicht als behoben deklarieren; POC 17.7 bleibt offen. Bestehende künstliche 17.3.2-Festschrift-Tests bestehen trotzdem.
- Einzelne Zusatz-/Formatierungs-/Feldinformationen sind in dieser Word-Version weiterhin nur teilweise verfügbar; Texte werden vollständig gelesen. Beispielsweise 36/42/43/45/69/71: 0 konkrete Hinweise, aber teilweise unsichere Zusatzdaten. Diese konservativen Reader-Grenzen wurden dokumentiert; kein Parser- oder Reader-Umbau innerhalb der Navigation.
- Windows, ältere Word/WebView-Versionen und reale Dokumente mit 1000+ Fußnoten noch nicht geprüft. Automatisierte Adaptertests decken 1200 Ziele mit konstanten Synchronisierungen ab, ersetzen den Host-Test nicht.
- Keine vollständige erneute Freigabe aller automatischen Korrekturen und kein Massen-Korrekturlauf in Word. Moduswechsel, einzelne sichere Korrektur und Navigation danach wurden geprüft.

## Einzelprüfung: Baseline vor Korrektur

| Fußnote | Sichtbare Hinweise | Zusatzdaten teilweise unsicher | Word-Navigation / Auswahl |
| --- | ---: | --- | --- |
| 1 | 18 | Ja | Bestätigt |
| 2 | 5 | Ja | Bestätigt |
| 3 | 11 | Ja | Bestätigt |
| 4 | 15 | Ja | Bestätigt |
| 5 | 7 | Ja | Bestätigt |
| 6 | 3 | Ja | Bestätigt |
| 7 | 12 | Ja | Bestätigt |
| 8 | 9 | Ja | Bestätigt |
| 9 | 7 | Ja | Bestätigt |
| 10 | 6 | Ja | Bestätigt |
| 11 | 1 | Nein | Bestätigt |
| 12 | 0 | Nein | Bestätigt |
| 13 | 9 | Ja | Bestätigt |
| 14 | 0 | Nein | Bestätigt |
| 15 | 9 | Ja | Bestätigt |
| 16 | 13 | Ja | Bestätigt |
| 17 | 7 | Nein | Bestätigt |
| 18 | 2 | Ja | Bestätigt |
| 19 | 0 | Nein | Bestätigt |
| 20 | 9 | Ja | Bestätigt |
| 21 | 12 | Ja | Bestätigt |
| 22 | 0 | Nein | Bestätigt |
| 23 | 4 | Ja | Bestätigt |
| 24 | 0 | Nein | Bestätigt |
| 25 | 0 | Nein | Bestätigt |
| 26 | 8 | Nein | Bestätigt |
| 27 | 0 | Nein | Bestätigt |
| 28 | 6 | Nein | Bestätigt |
| 29 | 3 | Nein | Bestätigt |
| 30 | 0 | Nein | Bestätigt |
| 31 | 0 | Nein | Bestätigt |
| 32 | 9 | Ja | Bestätigt |
| 33 | 1 | Nein | Bestätigt |
| 34 | 2 | Nein | Bestätigt |
| 35 | 1 | Ja | Bestätigt |
| 36 | 0 | Ja | Bestätigt |
| 37 | 3 | Nein | Bestätigt |
| 38 | 1 | Nein | Bestätigt |
| 39 | 13 | Ja | Bestätigt |
| 40 | 1 | Nein | Bestätigt |
| 41 | 1 | Nein | Bestätigt |
| 42 | 0 | Ja | Bestätigt |
| 43 | 0 | Ja | Bestätigt |
| 44 | 3 | Nein | Bestätigt |
| 45 | 0 | Ja | Bestätigt |
| 46 | 1 | Nein | Bestätigt |
| 47 | 5 | Nein | Bestätigt |
| 48 | 1 | Nein | Bestätigt |
| 49 | 1 | Nein | Bestätigt |
| 50 | 1 | Nein | Bestätigt |
| 51 | 2 | Nein | Bestätigt |
| 52 | 1 | Nein | Bestätigt |
| 53 | 5 | Ja | Bestätigt |
| 54 | 4 | Ja | Bestätigt |
| 55 | 1 | Ja | Bestätigt |
| 56 | 2 | Ja | Bestätigt |
| 57 | 2 | Ja | Bestätigt |
| 58 | 2 | Ja | Bestätigt |
| 59 | 2 | Ja | Bestätigt |
| 60 | 1 | Nein | Bestätigt |
| 61 | 1 | Nein | Bestätigt |
| 62 | 1 | Nein | Bestätigt |
| 63 | 1 | Nein | Bestätigt |
| 64 | 1 | Nein | Bestätigt |
| 65 | 16 | Ja | Bestätigt |
| 66 | 8 | Ja | Bestätigt |
| 67 | 4 | Nein | Bestätigt |
| 68 | 3 | Nein | Bestätigt |
| 69 | 0 | Ja | Bestätigt |
| 70 | 2 | Nein | Bestätigt |
| 71 | 0 | Ja | Bestätigt |
| 72 | 1 | Nein | Bestätigt |
| 73 | 1 | Nein | Bestätigt |
| 74 | 10 | Nein | Bestätigt |
| 75 | 1 | Ja | Bestätigt |
| 76 | 7 | Nein | Bestätigt |
| 77 | 1 | Nein | Bestätigt |
| 78 | 6 | Nein | Bestätigt |
| 79 | 2 | Nein | Bestätigt |
| 80 | 0 | Nein | Bestätigt |

## Automatisierte Checks

Typprüfung, Lint und alle 43 Testdateien erfolgreich. Navigationstests: unveränderte Ziele 1/80/1200; ungültige Ordinals; Einfügen/Löschen/Anzahländerung; Text-/Kontextänderung; mehrdeutige Ziele; bekannte eigene Korrekturen; unvollständige Mutationen; lokale Hostfehler; tatsächliche Word-Auswahl; keine Auswahl bei ungültigem Ziel. Auch Produktionsbuild (inklusive Safari15-/Assetprüfung), Entwicklungs- und Produktionsmanifest sowie `git diff --check` erfolgreich. Zwei bekannte Größenwarnungen: Taskpane etwa 600 KiB. Die vier README-Mermaid-Grafiken und lokalen Links sind geprüft.

Die frühere Mock-Prüfung hatte den After-Kontext unvollständig modelliert; der Test wurde korrigiert. Ein TypeScript-Rückgabepfad der zusätzlichen Höhenbeobachtung wurde vor dem vollständigen Word-Test ebenfalls korrigiert.

## Abschließende Kontrolle

Erneute Analyse nach der einzelnen Korrektur: **307 statt 308 Hinweise**, der BGHSt-Befund ist erledigt. Navigationsziel schließen: Button deaktiviert, neutrale Hilfsmeldung; keine Meldung eines zuvor aktiven Ziels. Die gespeicherte Testkopie enthält weiter 80 Fußnoten und ausschließlich die beabsichtigte BGHSt-Textkorrektur; temporäre Testmarker fehlen. Der Dateihash des Originals ist unverändert. Nach den UI-Feinheiten wurde Fußnote 80 nochmals mit tatsächlicher Word-Auswahl bestätigt.

Der Produktionsbuild liegt lokal in `dist`; generierte Hash-Dateinamen wurden neu erstellt. Download-ZIPs und Hosting sind unverändert. Die lokale Entwicklungsinstallation wurde für den Test gestartet, ohne Cloud-Deployment. README und dieser Bericht unterscheiden lokale Umsetzung, Veröffentlichung und noch offene Host-/Fachprüfungen.
