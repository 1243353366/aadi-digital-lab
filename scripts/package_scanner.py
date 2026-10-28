#!/usr/bin/env python3
"""Vendor a reviewed checkout; never downloads or runs a scanner."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent
COMMIT = "fd39f351dfa0f611be8f7f8b3ac7f189a1f18ada"
parser = argparse.ArgumentParser()
parser.add_argument("upstream", type=Path, help="local reviewed Zero-Breach-Toolkit checkout")
args = parser.parse_args()
source = args.upstream.resolve()
revision = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
if revision != COMMIT:
    raise SystemExit("Refusing an unreviewed upstream revision.")
target = ROOT / "scanner" / "vendor" / "zero-breach"
target.mkdir(parents=True, exist_ok=True)
for directory in ["scan", "iocs", "third_party/candiru"]:
    shutil.copytree(source / directory, target / directory, dirs_exist_ok=True, ignore=shutil.ignore_patterns("tests", "__pycache__", "*.pyc"))
for name in ["LICENSE", "NOTICE", "README.md", "PRIVACY.md", "SECURITY.md"]:
    shutil.copy2(source / name, target / name)
files = {str(path.relative_to(target)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(target.rglob("*")) if path.is_file()}
(ROOT / "scanner" / "source-manifest.json").write_text(json.dumps({"repository": "https://github.com/interplains/Zero-Breach-Toolkit", "commit": COMMIT, "sha256": files}, indent=2) + "\n", encoding="utf-8")
print("Pinned scanner packaged with licenses; no scan run.")
