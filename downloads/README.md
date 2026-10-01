# Footnote-Checker – Betapakete

[macOS-Paket](Footnote-Checker-macOS-Beta.zip) · [Windows-Paket](Footnote-Checker-Windows-Beta.zip) · [SHA-256-Prüfsummen](SHA256SUMS.txt)

macOS enthält das Mac-Script, Produktionsmanifest und INSTALLATION.md.
Windows enthält den Batch-Starter, das PowerShell-Script, Produktionsmanifest und INSTALLATION.md.

Die ZIPs enthalten weder Node.js noch den Anwendungsbuild. Sie richten Word für die jeweils gehostete Beta ein. Git-Push veröffentlicht Dateien, aktualisiert aber nicht das Hosting.

Erzeugen: `python3 scripts/package-beta.py` im Repository. Der Befehl überschreibt diese ZIPs und Prüfsummen ausschließlich lokal; führt keine Installer aus und veröffentlicht nichts. Erfolg: Beide Pakete melden verifiziertes Manifest. Installer- und Word-Tests auf beiden Plattformen bleiben separat erforderlich.
