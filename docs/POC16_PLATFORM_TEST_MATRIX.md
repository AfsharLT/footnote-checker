# POC 16 – Mac-/Windows-Testmatrix

Diese Matrix ist für denselben Testkorpus auf Word für Mac und Word für Windows auszufüllen. `Nicht getestet` ist kein bestandenes Ergebnis. Reale Nutzerdokumente oder sensible Inhalte gehören nicht in das Repository.

## Testkorpus

| Dokument | Inhalt | Erwarteter Zweck |
|---|---|---|
| `Small.docx` | 10–20 kurze Fußnoten | Start, Grundfunktionen, kleine Regression |
| `MixedRules.docx` | Gesetze, Kurzzitate, Rechtsprechung, amtliche Sammlung, Zeitschrift, Datenbank, Kommentar, Buch, Beitrag, OTHER, URLs und gemischte Formatierung | Reader-, Parser-, Mapping- und Rule-Parität |
| `WriteBack.docx` | Sichere Replace-/Insert-Fälle sowie Schriftart, Schriftgröße, kursiv, unterstrichen, hoch-/tiefgestellt und Zeichenabstand | Single- und Batch-Write-back |
| `Conflicts.docx` | MANUAL, TECHNICAL, INFO, Protected Ranges, Konflikte, externe Änderung, stale und ambiguous | Safety und Fehlerisolation |
| `Large1000.docx` | Mindestens 1.000 reproduzierbare Fußnoten | Performance, Endurance, CSV und Word-Schließen |

Die Dateien werden lokal aus nicht sensiblen Testdaten erstellt. Alternativ darf ein späterer deterministischer Dokumentgenerator verwendet werden; POC 16 nimmt keine Binärdokumente automatisch auf.

## Ergebniswerte

- Ergebnis: `Bestanden`, `Fehlgeschlagen`, `Blockiert` oder `Nicht getestet`.
- Severity bei Fehler: `Kritisch`, `Hoch`, `Mittel` oder `Niedrig`.
- Bei Plattformabweichungen zuerst API-Support, WebView, Fontverfügbarkeit, Downloadverhalten, CSS/Layout und bekannte Office-Hostfehler prüfen.

| Test | Mac Result | Windows Result | Notes | Severity if failed |
|---|---|---|---|---|
| Add-in startet; Ribbon-Logo und „Footnote Checker“ sichtbar | Nicht getestet | Nicht getestet |  |  |
| Capability-Diagnostik zeigt Word und korrekte Plattform | Nicht getestet | Nicht getestet |  |  |
| Fehlendes WordApi 1.5 wird verständlich abgefangen | Nicht getestet | Nicht getestet |  |  |
| `Small.docx`: Analysemodus | Nicht getestet | Nicht getestet | Findings und Dauer notieren |  |
| `Small.docx`: Prüfmodus | Nicht getestet | Nicht getestet |  |  |
| `Small.docx`: Korrekturmodus | Nicht getestet | Nicht getestet |  |  |
| Fußnoten nach neuer Analyse zunächst geschlossen | Nicht getestet | Nicht getestet |  |  |
| Open-State bleibt beim Moduswechsel erhalten | Nicht getestet | Nicht getestet |  |  |
| Suche sowie kombinierte Klassen-/Severity-/Statusfilter | Nicht getestet | Nicht getestet |  |  |
| Sticky Review-/Correction-/Settings-Bars | Nicht getestet | Nicht getestet |  |  |
| Single Text Replace | Nicht getestet | Nicht getestet |  |  |
| Single Text Insert | Nicht getestet | Nicht getestet |  |  |
| Same-footnote sequential Write-back | Nicht getestet | Nicht getestet |  |  |
| Batch im Prüfmodus | Nicht getestet | Nicht getestet |  |  |
| Automatischer Batch im Korrekturmodus | Nicht getestet | Nicht getestet |  |  |
| Font Name und Font Size werden nach Schreiben verifiziert | Nicht getestet | Nicht getestet | Verwendete Fonts notieren |  |
| Kursiv / Unterstrichen / Hochgestellt / Tiefgestellt | Nicht getestet | Nicht getestet |  |  |
| Zeichenabstand oder verständlicher Capability-Block | Nicht getestet | Nicht getestet |  |  |
| Protected Range wird nicht verändert | Nicht getestet | Nicht getestet |  |  |
| Externe Änderung außerhalb des Ziels bleibt relocatable | Nicht getestet | Nicht getestet |  |  |
| Zieländerung / Mehrdeutigkeit wird stale | Nicht getestet | Nicht getestet |  |  |
| Undo nach Write-back | Nicht getestet | Nicht getestet |  |  |
| Settings speichern und Word neu öffnen | Nicht getestet | Nicht getestet | Nur lokale Persistenz zusagen |  |
| Settings JSON Import/Export und Default Restore | Nicht getestet | Nicht getestet |  |  |
| Mapping CSV Roundtrip, Sources, Aliases und Overrides | Nicht getestet | Nicht getestet |  |  |
| CSV: UTF-8/Umlaute/Semikolon/Quotes/Zeilenumbruch | Nicht getestet | Nicht getestet | Excel bzw. Numbers öffnen |  |
| CSV Formula-Injection-Guard | Nicht getestet | Nicht getestet |  |  |
| Tastatur: Modi, Analyse, Filter, Fußnoten, Aktionen | Nicht getestet | Nicht getestet | Kein Mausgebrauch |  |
| Tastatur: Settings, Accordions, Speichern, Zurück | Nicht getestet | Nicht getestet |  |  |
| Responsive bei 320 px | Nicht getestet | Nicht getestet | Keine horizontale Scrollbar |  |
| Responsive bei 400 px | Nicht getestet | Nicht getestet |  |  |
| Responsive bei 520 px | Nicht getestet | Nicht getestet |  |  |
| Reduced Motion | Nicht getestet | Nicht getestet |  |  |
| `Large1000.docx`: Analyse | Nicht getestet | Nicht getestet | Dauer, Reader-Syncs und Findings notieren |  |
| `Large1000.docx`: Scroll/Filter/Search | Nicht getestet | Nicht getestet |  |  |
| `Large1000.docx`: Korrektur | Nicht getestet | Nicht getestet | Dauer, Runs, Syncs, Chunks notieren |  |
| `Large1000.docx`: CSV | Nicht getestet | Nicht getestet |  |  |
| Drei bis fünf große Läufe hintereinander | Nicht getestet | Nicht getestet | Kumulative Verlangsamung notieren |  |
| Dokument nach großem Lauf schließen | Nicht getestet | Nicht getestet |  |  |
| Word nach großem Lauf schließen | Nicht getestet | Nicht getestet | Kein Hängen/Crash |  |

## Plattformvergleich

Für jeden vollständigen Durchlauf vergleichen:

| Messwert | Mac | Windows | Abweichung / Ursache |
|---|---:|---:|---|
| Findings |  |  |  |
| Applied |  |  |  |
| Stale |  |  |  |
| Failed |  |  |  |
| Analysezeit |  |  |  |
| Korrekturzeit |  |  |  |
| Word.run |  |  |  |
| context.sync |  |  |  |
| Close-Verhalten |  |  |  |
| CSV-Anomalien |  |  |  |
| UI-Anomalien |  |  |  |
