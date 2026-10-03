# POC 17.7 – lokaler Abschlussstand

Stand: 3. Oktober 2026. Implementierung abgeschlossen und mit 8f55429 committed. Commit, Push und Integration nach main wurden anschließend ausdrücklich vom Nutzer angefordert. Kein Deployment oder neues Release dieses POC. Die unten dokumentierte einzelne kleine Word-Nachprüfung bleibt offen.

## Änderungen und Ursachen

- Die Sekundenanzeige verwendet eine monotone Zeitmessung und bleibt über Reader-, Analyse- und Korrekturphasen erhalten. Der Timer hängt am aktiven Lauf statt am wechselnden Phasentext. Bei verzögerten UI-Aufrufen wird die tatsächlich verstrichene Zeit nachgeführt; nur das kleine Fortschrittspanel aktualisiert sich.
- Festschrift-Pinpoints, etwa Hassemer S. 225 (239 ff.) und Hruschka S. 189 (198 ff.), werden mit Unicode-Leerzeichen und Rückverweisen erkannt. Ein eigenes Festschrift-Quellenformat steht in Editor, Filter, CSV und JSON bereit. Sieben alte unveränderte Standard-Festschriften werden anhand ihrer bekannten IDs/Namen übernommen. Eigene Quellen und ausdrückliche Zitierpräferenzen bleiben erhalten.
- Jahrbuchbeiträge ohne S.-Präfix, narrative Zusätze und gemischte Quellenfamilien werden präziser getrennt. In Fußnote 80 werden Kommentar und ZStW-Beleg separat geprüft; der Begleittext bleibt erhalten.
- Quellenpflege ergänzt belegte Werke und beobachtete Aliasvarianten. Bearbeiterstrukturen bleiben bei der Quellenauflösung erhalten, insbesondere Fischer/Lutz und Von der Groeben/Tiedje. Ein falsch zugeordneter alter Standardbeleg JRE 2014, S. 137 wird deaktiviert; Pawlik ist belegt.
- Identische Vorschläge für dieselbe Änderung werden zusammengeführt. Unsichere Bestandteile erzwingen weiterhin manuelle Prüfung. Verschiedene konkurrierende Änderungen werden nicht blind angewendet.
- Bereits dem ausdrücklichen Datumsprofil entsprechende Angaben lösen keine falschen Konsistenzwarnungen mehr aus. Ordinalzahlen in Begleittext werden nicht als Satz-/Quellengrenze missverstanden. Das verdächtige Jahr 2918 erzeugt einen manuellen Hinweis.

## Reale Word-Prüfung

Host: Word für macOS, Version 16.103.1130.3. Lokales HTTPS-Add-in, ausschließlich Testkopien. Beide Originaldateien wurden vor/nach den Prüfungen per SHA-256 verglichen und sind unverändert.

| Test | Fußnoten | Tatsächlich geschriebene Änderungen | Abschließende manuelle Hinweise | Schreibfehler / veraltete Ziele |
| --- | --- | --- | --- | --- |
| Kleine Kopie, mehrere Korrektur-/Nachprüfungen | 80 | 329 + 6 = 335 | 6 | 0 / 0 |
| Große Kopie, mehrere Korrektur-/Nachprüfungen | 1.144 | 1.276 + 11 + 11 = 1.298 | 121 | 0 / 0 |

Die Summen zählen nur WriteBackResultReason=APPLIED. ALREADY_RESOLVED ist eine bereits erledigte Änderung und wird nicht erneut als Schreibvorgang gezählt. Der letzte große Bericht enthält 143 Befunde: 22 AUTO (11 tatsächlich geschrieben, 11 bereits erledigt) und 121 MANUAL. Der letzte kleine Bericht enthält 23 Befunde: 17 AUTO bereits erledigt und 6 MANUAL; keine neue Änderung.

Das große Dokument besteht aus 11 Wiederholungen eines 104-Fußnoten-Blocks und enthält 100 unterschiedliche Texte. Die Analyse in Word hat alle 1.144 Fußnoten verarbeitet. Die Korpusprüfung enthält alle 80 kleinen und alle 100 unterschiedlichen großen Texte.

Während des letzten großen Laufs wurde eine fortlaufende Anzeige bei 13 s, 104 s und 220 s beobachtet, danach 1.144/1.144 und 100 %. Frühere Läufe zeigten den Übergang vom Lesen zur Korrektur ebenfalls ohne Zurücksetzen. Es wurde keine sekundengenaue Video-/Frame-Messung durchgeführt. Word/WebView können pausieren; eine absolute ununterbrochene Echtzeitdarstellung in einem blockierten Host wird nicht versprochen.

In Word direkt bestätigt: Literaturverzeichnis öffnet ohne WorkOverrideEditor-Crash; alle sieben Standard-Festschriften haben die richtige Art, und der Festschrift-Filter zeigt genau diese Quellen. Ein Navigations-Smoke-Test von POC 17.6 wurde ausgelöst; die abschließende Zielbestätigung konnte vor dem folgenden Word-Neustart nicht belastbar dokumentiert werden. Die umfassendere 17.6-Navigationsvalidierung bleibt im eigenen Bericht dokumentiert.

## Verbleibende manuelle Hinweise

Kleines Dokument: sechs Hinweise zu beschädigten/isolierten Seitenangaben (Fußnoten 3 und 9) sowie einem unsicheren Rückverweis/noch erscheinenden Beitrag (Fußnote 26). Keine Seitenzahl oder Publikation wird erfunden.

Großes Dokument: 77 CITATION_OTHER_REVIEW zu EU-Erwägungsgründen/Ratsmaterial, 33 FORMAT_ITALIC_REVIEW zu nicht eindeutig zugehörigen Satzzeichen und 11 JOURNAL_PUBLICATION_YEAR_REVIEW zum wiederholten Jahr 2918. Die Wiederholungen entsprechen wenigen Grundmustern; sie sind keine 121 unterschiedlichen unerkannten Werke. Die vorherigen falschen Datumshinweise und Bearbeiter-/Jahrbuch-Rückfragen sind im letzten Bericht verschwunden.

## Offene Host-Prüfung

Beim Schließen einer älteren temporären Testkopie startete Word neu und bot eine Wiederherstellung an. Die Wiederherstellung wurde separat gespeichert, nicht über die Originale oder die maßgeblichen Testkopien. Nach dem Neustart zeigte Word: „Die Add-Ins wurden deaktiviert. Wenden Sie sich an Ihren IT-Administrator für weitere Informationen.“ Das Entwickler-Add-in war ebenfalls deaktiviert. Diese Host-Einstellung wurde nicht verändert.

Der gespeicherte kleine Teststand enthält noch den ZStW-Beleg Roxin, ZStW 93 (1981), S. 68, 70 ff. in Fußnote 3 mit Komma. Die aktuelle Engine erkennt und schlägt hierfür S. 68 (70 ff.) vor; dieser letzte Codepfad konnte nach dem Neustart nicht erneut im echten Word ausgeführt werden. Der zuvor exportierte kleine Bericht stammt vom alten noch geladenen Bundle. Deshalb gilt die kleine letzte Nachprüfung nicht als vollständiger Nachweis des endgültigen Codes. Nach Freigabe des Add-ins einmal die kleine Testkopie mit dem aktuellen Build im Korrekturmodus prüfen und anschließend bestätigen, dass keine sicheren Vorschläge offen sind. Keine automatische Änderung an den Originaldokumenten.

Einzelne optionale Word-Formatierungsmetadaten waren nicht vollständig verfügbar; der Reader meldet dies verständlich und verarbeitet den vollständigen Text weiter. Fehlende Zusatzdaten werden nicht als vollständig geprüft ausgegeben. Windows, ältere Word-Versionen und andere WebViews wurden in dieser Sitzung nicht real getestet.

## Automatisierte Prüfungen

- npm run typecheck: erfolgreich.
- npm run lint: erfolgreich.
- npm test: alle 45 Testdateien erfolgreich, einschließlich Timer-/Phasenwechsel, verzögerter Timeraufrufe, persistierter alter Festschrift-Standardquellen, eigener Quellen, CSV/JSON, Korpus-Erfassung, Offsets und konservativer Review-Regeln.
- npm run validate: Manifest gültig. Dies ist kein Nachweis der Laufzeitkompatibilität aller Word-Versionen.
- npm run build: erfolgreich; Produktionsartefakte geprüft. Zwei Warnungen betreffen die Bundlegröße (Taskpane 611 KiB), keine Buildfehler.
- git diff --check: erfolgreich.
- README-Mermaid-Diagramme: Syntaxprüfung erfolgreich.

## Lokale Prüfarbeitsdateien

Maßgebliche Kopien: /private/tmp/FNC-17.7-80-closure.docx und /private/tmp/FNC-17.7-1144-final-validation.docx. Letzte Berichte: /private/tmp/FNC-17.7-80-final-recheck.csv und /private/tmp/FNC-17.7-1144-final-recheck.csv. Frühere CSV-Dateien dokumentieren die aufeinanderfolgenden Korrekturen. Temporäre Dateien können vom Betriebssystem bereinigt werden und sind keine veröffentlichten Release-Artefakte. Die Arbeitsfenster der Testdokumente wurden geschlossen; es wurden keine neuen Originaldokumente verändert.

Siehe [vollständige Korpusübersicht](POC_17_7_CORPUS_AUDIT.md). Erst nach der offenen kleinen Word-Nachprüfung ist der 17er-Abschluss vollständig bestätigt.

## Nachgereichte Nutzer-Screenshots

Vier vom Nutzer bereitgestellte Screenshots vom 3. Oktober 2026 (22:15–22:20 Uhr) zeigen Start, Einstellungen, einen erfolgreichen Korrekturlauf mit 80 Fußnoten/329 tatsächlichen Korrekturen/sechs manuellen Hinweisen sowie den Fortschritt mit 1.144 Fußnoten. Sie belegen, dass das Add-in wieder nutzbar ist. Der einzelne ZStW-Beleg aus der offenen Nachprüfung ist darin nicht sichtbar; dessen endgültiger Word-Nachtest wird deshalb nicht als erledigt ausgegeben.
