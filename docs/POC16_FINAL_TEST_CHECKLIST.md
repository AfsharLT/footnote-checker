# POC 16 – Finale Testcheckliste

Diese Checkliste ist ein Hardening-Nachweis, kein Release Guide. Hosting, öffentliche URLs, Marketplace, Partner Center, Store-Metadaten und Deployment gehören zu POC 17.

## Automatisiert

- [ ] TypeScript ohne Fehler
- [ ] Lint ohne Fehler
- [ ] Vollständige Testsuite grün
- [ ] Capability Detection: WordApi, WordApiDesktop und SharedRuntime
- [ ] Host-Work-State: ANALYZING, WRITING, FINALIZING, IDLE
- [ ] Message Dedup
- [ ] Error-Boundary-Fallback strukturell geprüft
- [ ] Reader-/Engine-Benchmarks 10, 100, 500 und 1.000+
- [ ] Review-Gruppierung und kombinierte Filter mit großer Datenmenge
- [ ] Write-back: Replace, Insert, Format, Relocation, stale, ambiguous, protected und idempotent
- [ ] Format-Write-Verifikation
- [ ] Batch: Review, Correction, Chunking, Fehlerisolation, Fatalpfad und Cleanup
- [ ] CSV: Statusklassen, Mapping, Formatierung, BOM, Semikolon, Quoting und Formula Guard
- [ ] Responsive-Struktur 320/400/520 px
- [ ] Production Build
- [ ] Frischer Dev-Server-Compile
- [ ] `git diff --check`

## Manueller Mac Quick Test

- [ ] Add-in und Ribbon starten
- [ ] 20-Fußnoten-Dokument analysieren
- [ ] Prüfmodus und kombinierte Filter
- [ ] Korrekturmodus
- [ ] Single Write-back
- [ ] Same-footnote Write-back
- [ ] CSV in Excel/Numbers
- [ ] Settings speichern, Word schließen und wieder öffnen
- [ ] Sticky Bars, Suche und Tastaturbedienung
- [ ] 1.000+-Dokument vollständig durchlaufen
- [ ] Dokument und Word nach abgeschlossenem Cleanup schließen

## Manueller Windows Quick Test

- [ ] Exakt denselben Korpus und Ablauf wie auf dem Mac verwenden
- [ ] Add-in/Ribbon, Analyse, Prüfung und Korrektur
- [ ] Single-, Same-footnote- und Batch-Write-back
- [ ] CSV in Windows Excel
- [ ] Settings-Persistenz nach Word-Neustart
- [ ] Sticky Bars, Suche, Tastatur und Responsive
- [ ] 1.000+-Dokument, Dokument schließen und Word schließen

## Large-Document-/Host-Stabilität

- [ ] Analyse: Reader-Dauer, Engine-Dauer, Gesamtdauer und Sync-Anzahl notieren
- [ ] Korrektur: Gesamtdauer, betroffene Fußnoten, Chunks, Runs, Syncs und Ergebniszahlen notieren
- [ ] Cleanup-Dauer notieren
- [ ] Abschlussanzeige erscheint erst nach Cleanup
- [ ] Keine laufenden Runner, Queues, Timer oder gehaltenen Snapshots
- [ ] Drei bis fünf Wiederholungsläufe ohne starke kumulative Verschlechterung
- [ ] CSV-Export widerruft Object URL
- [ ] Kein Fake-Word-Close-Spinner und kein Excel-only Close-Hook

## UI und Accessibility

- [ ] Keine sichtbaren Template-/Debug-Platzhalter
- [ ] Deutsche nutzerbezogene Texte konsistent
- [ ] Erklärungen nicht doppelt
- [ ] MANUAL ohne Aktion zeigt keinen aktiven Übernehmen-Button
- [ ] Empty-, Partial-, Error-, Stale- und Unsupported-Zustände verständlich
- [ ] Status enthält Text/Icon und wird nicht nur durch Farbe vermittelt
- [ ] Focus sichtbar, Keyboard-Reihenfolge sinnvoll, Accordions und Selects bedienbar
- [ ] Reduced Motion respektiert
- [ ] Keine horizontale Scrollbar bei 320/400/520 px
- [ ] Sticky Bars überdecken keine Aktionen

## Offene Punkte vor Freigabe

| Issue | Plattform | Severity | Owner | Status / Entscheidung |
|---|---|---|---|---|
| Reale Mac-Hostmatrix noch auszufüllen | Mac | Hoch |  | Offen |
| Reale Windows-Hostmatrix noch auszufüllen | Windows | Hoch |  | Offen |
| Word-Close-Verhalten nach 1.000+-Lauf | Mac + Windows | Kritisch, falls fehlerhaft |  | Nicht getestet |

Abschlusskriterium: Keine bekannten kritischen Fehler bei Datenverlust, falschem Write-back, Crash, Endlos-Runner, starkem Host-Hängen oder den Kernfunktionen auf Mac und Windows. Kosmetische Restpunkte werden mit Severity dokumentiert.
