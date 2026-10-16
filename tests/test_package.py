import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

class PackageTests(unittest.TestCase):
    def test_archive_is_portable_and_excludes_private_local_files(self):
        spec = importlib.util.spec_from_file_location('packager', 'scripts/package-source.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ['README.md', 'dist/app.js', '.env', '.env.local', 'private.json', 'data.db', '.openai/hosting.json', 'tests/test-results/upload.csv']:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('private-fixture')
            (root / 'dist/link.js').symlink_to(root / '.env')
            with zipfile.ZipFile(module.build_archive(root)) as archive:
                self.assertEqual(set(archive.namelist()), {'README.md', 'dist/app.js', '.openai/hosting.json'})
                self.assertNotIn('private-fixture', archive.read('.openai/hosting.json').decode())
