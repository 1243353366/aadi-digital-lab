#!/usr/bin/env python3
"""Copy a website workspace into this monorepo without credentials or generated files."""
import argparse
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
args = parser.parse_args()
source = args.source.resolve()
if not (source / "client/src/App.tsx").is_file() or not (source / "package.json").is_file():
    raise SystemExit("Source is not the Compass website workspace.")
files = subprocess.check_output(["git", "-C", str(source), "ls-files", "-z", "--cached", "--others", "--exclude-standard"]).decode().split("\0")
excluded = {".project-config.json", "vite.config.ts.bak", "template.json", "todo.md"}
copied = 0
for relative in filter(None, files):
    if relative in excluded or relative.startswith((".env", ".manus", "client/public/__manus__/", "node_modules/", "dist/", ".git/")):
        continue
    path = source / relative
    if not path.is_file() or path.is_symlink():
        continue
    target = ROOT / "website" / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, target)
    copied += 1
print(f"Exported {copied} source files; no deployment performed.")
