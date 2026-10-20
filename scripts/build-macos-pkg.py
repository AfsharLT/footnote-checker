#!/usr/bin/env python3
"""Build the unsigned, user-home-only Mac installer. Never installs/publishes."""
import argparse
from pathlib import Path
import datetime
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
PACKAGE_ID = 'de.footnote-checker.word-addin.macos'
ADDIN_ID = 'e99f1e9d-b886-4eb7-a1b8-2c0561b078e8'
HOST = 'https://footnote-checker.shayesteh-afshar.workers.dev'
NS = {'o': 'http://schemas.microsoft.com/office/appforoffice/1.1'}


def validate_manifest(path):
    data = path.read_bytes()
    if b'<!DOCTYPE' in data.upper() or b'localhost' in data.lower():
        raise ValueError('Production manifest contains a DTD or a localhost URL.')
    root = ET.fromstring(data)
    if root.tag != '{' + NS['o'] + '}OfficeApp' or root.findtext('o:Id', namespaces=NS) != ADDIN_ID:
        raise ValueError('Unexpected Office add-in ID or namespace.')
    location = root.find('o:DefaultSettings/o:SourceLocation', NS)
    if location is None or location.get('DefaultValue') != HOST + '/taskpane.html':
        raise ValueError('Production manifest does not point at the hosted taskpane.')
    return data


def build(output, version):
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Installer version must have three numeric components.')
    for tool in ('/usr/bin/pkgbuild', '/usr/bin/productbuild', '/usr/sbin/pkgutil'):
        if not Path(tool).exists():
            raise RuntimeError('Build requires macOS with the Apple package tools.')
    manifest = validate_manifest(ROOT / 'manifest.production.xml')
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='fnc-pkg-') as directory:
        staging = Path(directory)
        scripts = staging / 'scripts'
        shutil.copytree(ROOT / 'installers/macos/pkg/scripts', scripts)
        (scripts / 'manifest.production.xml').write_bytes(manifest)
        for file in scripts.iterdir():
            file.chmod(0o755 if file.name in ('preinstall', 'postinstall') else 0o644)
        component = staging / 'FNC-component.pkg'
        subprocess.run(['/usr/bin/pkgbuild', '--nopayload', '--scripts', str(scripts),
                        '--identifier', PACKAGE_ID, '--version', version, str(component)], check=True)
        distribution = (ROOT / 'installers/macos/pkg/Distribution.xml').read_text()
        distribution = distribution.replace('version="0.1.0"', f'version="{version}"')
        (staging / 'Distribution.xml').write_text(distribution)
        subprocess.run(['/usr/bin/productbuild', '--distribution', str(staging / 'Distribution.xml'),
                        '--resources', str(ROOT / 'installers/macos/pkg/resources'),
                        '--package-path', str(staging), str(staging / 'FootnoteChecker.pkg')], check=True)
        expanded = staging / 'expanded'
        subprocess.run(['/usr/sbin/pkgutil', '--expand-full', str(staging / 'FootnoteChecker.pkg'), str(expanded)], check=True)
        embedded = list(expanded.rglob('manifest.production.xml'))
        if len(embedded) != 1 or embedded[0].read_bytes() != manifest:
            raise RuntimeError('Embedded manifest does not match the production manifest.')
        domains = ET.parse(expanded / 'Distribution').getroot().find('domains')
        if domains is None or domains.attrib != {'enable_anywhere': 'false', 'enable_currentUserHome': 'true', 'enable_localSystem': 'false'}:
            raise RuntimeError('Installer must exclusively target the current user home.')
        # Move only the fully built and inspected package into the download directory.
        shutil.copyfile(staging / 'FootnoteChecker.pkg', output)
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    metadata = {
        'installerVersion': version, 'packageIdentifier': PACKAGE_ID,
        'builtAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'baseGitCommit': revision, 'localUnpublishedBuild': True,
        'signed': False, 'notarized': False, 'installationDomain': 'CurrentUserHomeDirectory',
        'manifestSHA256': hashlib.sha256(manifest).hexdigest(),
        'packageSHA256': hashlib.sha256(output.read_bytes()).hexdigest(),
        'hostedTaskpane': HOST + '/taskpane.html',
        'applicationCodeIncluded': False,
    }
    output.with_suffix('.build.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(f'Built and structurally verified: {output} ({output.stat().st_size} bytes)')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'downloads/FootnoteChecker.pkg')
    parser.add_argument('--version', default='0.1.0')
    args = parser.parse_args()
    build(args.output, args.version)
