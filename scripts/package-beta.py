#!/usr/bin/env python3
"""Build manifest-only beta packages. Never installs, publishes or deploys."""
from pathlib import Path
import hashlib
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'downloads'
NS = {'o': 'http://schemas.microsoft.com/office/appforoffice/1.1'}
manifest = ROOT / 'manifest.production.xml'
tree = ET.parse(manifest)
source = tree.find('o:DefaultSettings/o:SourceLocation', NS)
expected = 'https://footnote-checker.shayesteh-afshar.workers.dev/taskpane.html'
if source is None or source.attrib.get('DefaultValue') != expected:
    raise SystemExit('Production manifest does not point at the expected hosted taskpane.')
if tree.findtext('o:Id', namespaces=NS) != 'e99f1e9d-b886-4eb7-a1b8-2c0561b078e8':
    raise SystemExit('Unexpected add-in ID; review before packaging.')

OUT.mkdir(exist_ok=True)
packages = {
    'Footnote-Checker-macOS-Beta.zip': ('macos', ['install-footnote-checker-mac.command']),
    'Footnote-Checker-Windows-Beta.zip': ('windows', [
        'install-footnote-checker-windows.bat', 'install-footnote-checker-windows.ps1']),
}
checksums = []
for filename, (platform, scripts) in packages.items():
    folder = filename.removesuffix('.zip')
    items = [('manifest.production.xml', manifest),
             ('INSTALLATION.md', ROOT / 'docs/INSTALLATION.md')]
    items += [(name, ROOT / 'installers' / platform / name) for name in scripts]
    with zipfile.ZipFile(OUT / filename, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, path in items:
            info = zipfile.ZipInfo(f'{folder}/{name}', date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            mode = 0o755 if name.endswith('.command') else 0o644
            info.external_attr = (0o100000 | mode) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())
    with zipfile.ZipFile(OUT / filename) as archive:
        if archive.testzip() is not None:
            raise SystemExit(f'Corrupt archive: {filename}')
        if archive.read(f'{folder}/manifest.production.xml') != manifest.read_bytes():
            raise SystemExit(f'Manifest mismatch: {filename}')
    digest = hashlib.sha256((OUT / filename).read_bytes()).hexdigest()
    checksums.append(f'{digest}  {filename}')
    print(f'{filename}: {len(items)} files, manifest verified')
(OUT / 'SHA256SUMS.txt').write_text('\n'.join(checksums) + '\n')
(OUT / 'README.md').write_text('''# Footnote-Checker – Betapakete

[macOS-Paket](Footnote-Checker-macOS-Beta.zip) · [Windows-Paket](Footnote-Checker-Windows-Beta.zip) · [SHA-256-Prüfsummen](SHA256SUMS.txt)

macOS enthält das Mac-Script, Produktionsmanifest und INSTALLATION.md.
Windows enthält den Batch-Starter, das PowerShell-Script, Produktionsmanifest und INSTALLATION.md.

Die ZIPs enthalten weder Node.js noch den Anwendungsbuild. Sie richten Word für die jeweils gehostete Beta ein. Git-Push veröffentlicht Dateien, aktualisiert aber nicht das Hosting.

Erzeugen: `python3 scripts/package-beta.py` im Repository. Der Befehl überschreibt diese ZIPs und Prüfsummen ausschließlich lokal; führt keine Installer aus und veröffentlicht nichts. Erfolg: Beide Pakete melden verifiziertes Manifest. Installer- und Word-Tests auf beiden Plattformen bleiben separat erforderlich.
''')
