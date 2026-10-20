#!/usr/bin/env python3
"""Isolated filesystem tests: never install into the real Word profile."""
from pathlib import Path
import hashlib
import importlib.util
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
HELPER = ROOT / 'installers/macos/pkg/scripts/install-manifest.sh'
SOURCE = ROOT / 'manifest.production.xml'
WORD = Path('Library/Containers/com.microsoft.Word/Data/Documents/wef')
BACKUPS = Path('Library/Application Support/Footnote-Checker/Installer Backups')


def install(home, source=SOURCE, success=True):
    result = subprocess.run(['/bin/bash', '-c', 'source "$1"; fnc_install_manifest "$2" "$3"',
                             'fnc-test', str(HELPER), str(home), str(source)], capture_output=True, text=True)
    assert (result.returncode == 0) == success, result.stdout + result.stderr
    return result


for file in (ROOT / 'installers/macos/pkg/scripts').iterdir():
    subprocess.run(['/bin/bash', '-n', str(file)], check=True)
with tempfile.TemporaryDirectory(prefix='fnc-installer-tests-') as folder:
    home = Path(folder) / 'Test User'
    (home / WORD.parent).mkdir(parents=True)
    install(home)
    target = home / WORD / 'manifest.production.xml'
    assert target.read_bytes() == SOURCE.read_bytes()
    assert target.stat().st_mode & 0o777 == 0o644
    print('PASS: fresh installation; path with spaces; exact bytes; correct mode')
    install(home)
    assert not (home / BACKUPS).exists()
    print('PASS: identical reinstall is idempotent')
    old = SOURCE.read_bytes().replace(b'<Version>1.0.0.1</Version>', b'<Version>1.0.0.0</Version>')
    target.write_bytes(old)
    foreign = target.parent / 'another-addin.xml'; foreign.write_text('untouched')
    install(home)
    backups = list((home / BACKUPS).glob('*/manifest.production.xml'))
    assert len(backups) == 1 and backups[0].read_bytes() == old
    assert foreign.read_text() == 'untouched'
    print('PASS: upgrade creates exact backup; foreign add-in untouched')
    install(home)
    assert len(list((home / BACKUPS).glob('*/manifest.production.xml'))) == 1
    bad = Path(folder) / 'bad.xml'; bad.write_text('<broken/>')
    install(home, bad, success=False)
    assert target.read_bytes() == SOURCE.read_bytes()
    print('PASS: invalid new manifest preserves existing target')
    target.write_bytes(SOURCE.read_bytes().replace(b'e99f1e9d-b886-4eb7-a1b8-2c0561b078e8', b'00000000-0000-0000-0000-000000000000'))
    existing = target.read_bytes(); install(home, success=False); assert target.read_bytes() == existing
    print('PASS: foreign ID at target is never replaced')
    target.unlink(); target.symlink_to(foreign)
    install(home, success=False); assert foreign.read_text() == 'untouched'; target.unlink()
    print('PASS: symlink target rejected')
    target.parent.rmdir() if not list(target.parent.iterdir()) else None
    linkhome = Path(folder) / 'linked user'; (linkhome / WORD.parent).mkdir(parents=True)
    (linkhome / WORD).symlink_to(home / WORD, target_is_directory=True)
    install(linkhome, success=False)
    print('PASS: symlink directory rejected')
    absent = Path(folder) / 'not initialized'; absent.mkdir()
    install(absent, success=False)
    print('PASS: Word not initialized fails before writing')
    blocked = Path(folder) / 'blocked backup'; (blocked / WORD).mkdir(parents=True)
    (blocked / WORD / 'manifest.production.xml').write_bytes(old)
    (blocked / 'Library/Application Support').write_text('not a directory')
    install(blocked, success=False)
    assert (blocked / WORD / 'manifest.production.xml').read_bytes() == old
    print('PASS: unusable backup path preserves previous manifest')
print('All isolated Mac installer tests passed. No live profile was modified.')
