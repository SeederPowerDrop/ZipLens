"""Verify the application's license files before building or packaging."""
from pathlib import Path


def verify_app_license(root: Path) -> None:
    documents = {}
    for relative in ('LICENSE', 'legal/ziplens/COPYING.txt', 'legal/ziplens/NOTICE.txt'):
        path = root / relative
        if not path.is_file() or not (data := path.read_bytes()).strip():
            raise RuntimeError(f'Missing or empty ZipLens license document: {relative}')
        documents[relative] = data
    if documents['legal/ziplens/COPYING.txt'] != documents['LICENSE']:
        raise RuntimeError('Bundled ZipLens GPL text differs from the canonical LICENSE')
