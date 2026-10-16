"""Create a portable source ZIP from explicit source paths and file types."""
from pathlib import Path
import json
import zipfile

ROOT_FILES = {'README.md', 'LICENSE', 'package.json', 'package-lock.json', '.gitignore', 'playwright.config.mjs'}
DIRECTORIES = {'dist', 'scripts', 'tests', 'docs', '.github'}
EXTENSIONS = {'.js', '.mjs', '.py', '.html', '.css', '.svg', '.csv', '.md', '.yml', '.yaml'}
EXCLUDED = {'download', 'node_modules', '__pycache__', 'test-results', 'playwright-report', '.git'}

def build_archive(root):
    target = root / 'dist/download/csv-doctor-source.zip'
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(root.rglob('*')):
            rel = path.relative_to(root)
            if not path.is_file() or any(part in EXCLUDED for part in rel.parts):
                continue
            if any(p.is_symlink() for p in [path, *path.parents]):
                continue
            if path.name.startswith('.env') or path.name == 'secrets.toml':
                continue
            if rel.as_posix() in ROOT_FILES or (len(rel.parts) > 1 and rel.parts[0] in DIRECTORIES and path.suffix in EXTENSIONS):
                archive.write(path, rel.as_posix())
        archive.writestr('.openai/hosting.json', json.dumps({'static': {'directory': 'dist'}}, indent=2) + '\n')
    return target

if __name__ == '__main__':
    print(build_archive(Path(__file__).resolve().parent.parent))
