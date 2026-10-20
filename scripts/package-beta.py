#!/usr/bin/env python3
"""Build local beta downloads. Default: Mac only. Never installs or publishes."""
import argparse
from pathlib import Path
import hashlib
import subprocess
import sys
import zipfile
import json
import tempfile
from importlib.util import spec_from_file_location, module_from_spec

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'downloads'


def archive(filename, items):
    folder = filename.removesuffix('.zip')
    with zipfile.ZipFile(OUT / filename, 'w', compression=zipfile.ZIP_DEFLATED) as target:
        for name, path in items:
            info = zipfile.ZipInfo(f'{folder}/{name}', date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100644 << 16)
            info.compress_type = zipfile.ZIP_DEFLATED
            target.writestr(info, path.read_bytes())
    with zipfile.ZipFile(OUT / filename) as target:
        assert target.testzip() is None
        for name, path in items:
            assert target.read(f'{folder}/{name}') == path.read_bytes()
    print(f'{filename}: {len(items)} files verified')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--platform', choices=['macos', 'windows', 'all'], default='macos')
    parser.add_argument('--reuse-pkg', action='store_true', help='Verify and preserve the exact already-tested Mac PKG.')
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    spec = spec_from_file_location('fnc_mac_builder', ROOT / 'scripts/build-macos-pkg.py')
    builder = module_from_spec(spec); spec.loader.exec_module(builder)
    builder.validate_manifest(ROOT / 'manifest.production.xml')
    if args.platform in ('macos', 'all'):
        for guide in ['Footnote-Checker-macOS-Installation.html', 'Footnote-Checker-macOS-Installation.pdf']:
            if not (OUT / guide).is_file():
                raise SystemExit('Generate the Mac guide first: scripts/build-macos-guide.py (requires reportlab).')
        if args.reuse_pkg:
            package = OUT / 'FootnoteChecker.pkg'
            metadata = json.loads((OUT / 'FootnoteChecker.build.json').read_text())
            if hashlib.sha256(package.read_bytes()).hexdigest() != metadata['packageSHA256']:
                raise SystemExit('Existing PKG differs from the tested package checksum.')
            if hashlib.sha256((ROOT / 'manifest.production.xml').read_bytes()).hexdigest() != metadata['manifestSHA256']:
                raise SystemExit('Manifest changed since the tested package was built.')
            with tempfile.TemporaryDirectory(prefix='fnc-reuse-') as directory:
                expanded = Path(directory) / 'expanded'
                subprocess.run(['/usr/sbin/pkgutil', '--expand-full', str(package), str(expanded)], check=True)
                manifests = list(expanded.rglob('manifest.production.xml'))
                if len(manifests) != 1 or manifests[0].read_bytes() != (ROOT / 'manifest.production.xml').read_bytes():
                    raise SystemExit('Embedded manifest mismatch.')
                for source in (ROOT / 'installers/macos/pkg/scripts').iterdir():
                    if source.is_file() and (manifests[0].parent / source.name).read_bytes() != source.read_bytes():
                        raise SystemExit('Installer scripts changed; do not reuse this PKG.')
            print('Preserving exact tested PKG: checksum, manifest and scripts verified')
        else:
            builder.build(OUT / 'FootnoteChecker.pkg', '0.1.0')
        items = [('FootnoteChecker.pkg', OUT / 'FootnoteChecker.pkg'),
                 ('INSTALLATION.html', OUT / 'Footnote-Checker-macOS-Installation.html'),
                 ('INSTALLATION.pdf', OUT / 'Footnote-Checker-macOS-Installation.pdf'),
                 ('BUILD.json', OUT / 'FootnoteChecker.build.json')]
        inner = ''.join(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + name + '\n' for name, path in items)
        # A separate temporary checksum file avoids including the archive's hash in itself.
        with tempfile.TemporaryDirectory(prefix='fnc-zip-') as tmp:
            sums = Path(tmp) / 'SHA256SUMS.txt'; sums.write_text(inner)
            archive('Footnote-Checker-macOS-Beta.zip', items + [('SHA256SUMS.txt', sums)])
    if args.platform in ('windows', 'all'):
        archive('Footnote-Checker-Windows-Beta.zip', [
            ('manifest.production.xml', ROOT / 'manifest.production.xml'),
            ('INSTALLATION.md', ROOT / 'docs/INSTALLATION.md'),
            ('install-footnote-checker-windows.bat', ROOT / 'installers/windows/install-footnote-checker-windows.bat'),
            ('install-footnote-checker-windows.ps1', ROOT / 'installers/windows/install-footnote-checker-windows.ps1')])
    files = sorted(p for p in OUT.iterdir() if p.suffix in ('.pkg', '.zip', '.pdf', '.html') or p.name == 'FootnoteChecker.build.json')
    (OUT / 'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.name + '\n' for p in files))


if __name__ == '__main__': main()
