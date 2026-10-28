#!/usr/bin/env python3
"""Reproduce the reviewed upstream + local security patch; never run a scan.

Existing destinations are verified, never overwritten or recursively removed.
Use --output NEW_DIRECTORY for a new build. Trust begins in the reviewed app
release, not in a digest downloaded alongside scanner/indicator data.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
COMMIT = "fd39f351dfa0f611be8f7f8b3ac7f189a1f18ada"
PATCH_ID = "compass-scanner-security-2026-10-28-v1"


def file_hashes(root):
    result = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError("package source contains a redirected file")
        if "__pycache__" in path.relative_to(root).parts or path.suffix == ".pyc":
            continue  # the launcher/audit never trust existing bytecode caches
        if path.is_file():
            result[path.relative_to(root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def build(source, output):
    source = source.resolve()
    revision = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
    if revision != COMMIT:
        raise ValueError("Refusing an unreviewed upstream revision")
    if subprocess.check_output(["git", "-C", str(source), "status", "--porcelain", "--untracked-files=all"], text=True).strip():
        raise ValueError("Upstream checkout must be clean; local state is not an approval")
    patch = ROOT / "scanner" / "patches" / "owned-state-and-feed-trust.patch"
    approval = json.loads((ROOT / "scanner" / "patches" / "approval.json").read_text())
    patch_digest = hashlib.sha256(patch.read_bytes()).hexdigest()
    if approval.get("patchId") != PATCH_ID or approval.get("upstreamCommit") != COMMIT or approval.get("sha256") != patch_digest:
        raise ValueError("Local security patch does not match the release approval")
    with tempfile.TemporaryDirectory(prefix="compass-package-") as folder:
        work, staged = Path(folder) / "upstream", Path(folder) / "package"
        work.mkdir()
        # git archive reads the approved committed tree, not untracked worktree
        # contents. Local input only; no network, hooks, scans, or code execution.
        archive = subprocess.check_output(["git", "-C", str(source), "archive", "--format=tar", COMMIT])
        import io
        import tarfile
        with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as records:
            for member in records:
                parts = Path(member.name).parts
                if member.name.startswith("/") or ".." in parts or not (member.isfile() or member.isdir()):
                    raise ValueError("unsupported path or link in upstream archive")
                target = work.joinpath(*parts)
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with records.extractfile(member) as src, target.open("xb") as dest:
                        shutil.copyfileobj(src, dest)
        subprocess.run(["git", "-C", str(work), "init", "--quiet"], check=True)
        subprocess.run(["git", "-C", str(work), "apply", "--check", str(patch)], check=True)
        subprocess.run(["git", "-C", str(work), "apply", str(patch)], check=True)
        staged.mkdir()
        for directory in ("scan", "iocs", "third_party/candiru"):
            shutil.copytree(work / directory, staged / directory,
                            ignore=shutil.ignore_patterns("tests", "__pycache__", "*.pyc"))
        for name in ("LICENSE", "NOTICE", "README.md", "PRIVACY.md", "SECURITY.md",
                     "SECURITY-CHANGELOG.md", "SECURITY-DEMONSTRATION.md"):
            shutil.copyfile(work / name, staged / name)
        hashes = file_hashes(staged)
        if output.exists():
            if output.is_symlink() or file_hashes(output) != hashes:
                raise ValueError("Existing destination differs; preserved unchanged. Choose a NEW --output directory")
        else:
            output.parent.mkdir(parents=True, exist_ok=True)
            # Never replace existing output or use untrusted state for rollback.
            output.mkdir(mode=0o700, exist_ok=False)
            shutil.copytree(staged, output, dirs_exist_ok=True)
        manifest = {"repository": "https://github.com/interplains/Zero-Breach-Toolkit", "commit": COMMIT,
                    "upstreamCommit": COMMIT, "patchId": PATCH_ID, "patchSha256": patch_digest,
                    "trustBoundary": "approved application release; checksum is not publisher authentication",
                    "sha256": hashes}
        return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("upstream", type=Path, help="clean local checkout of the approved upstream commit")
    parser.add_argument("--output", type=Path, default=ROOT / "scanner" / "vendor" / "zero-breach")
    parser.add_argument("--manifest", type=Path, help="write a NEW manifest file; never overwrite existing data")
    args = parser.parse_args()
    try:
        manifest = build(args.upstream, args.output.absolute())
        if args.manifest:
            with args.manifest.open("x", encoding="utf-8") as file:
                json.dump(manifest, file, indent=2)
                file.write("\n")
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, "Package refused: " + str(error) + "\n")
    print("Approved upstream + local patch package verified; no scan run, no existing output overwritten.")


if __name__ == "__main__":
    main()
