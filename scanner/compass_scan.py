#!/usr/bin/env python3
"""Consent-gated local launcher for a pinned Zero-Breach-Toolkit release.

This launcher never uploads a report, downloads updates, elevates privileges,
collects from a live phone, or accepts arbitrary commands from an AI agent.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / "vendor" / "zero-breach"
COMMIT = "fd39f351dfa0f611be8f7f8b3ac7f189a1f18ada"
CONSENT_VERSION = "compass-local-scan-v1"
CONSENT_PHRASE = "I AUTHORIZE THIS LOCAL SCAN"


def verify_source() -> None:
    manifest = json.loads((ROOT / "source-manifest.json").read_text(encoding="utf-8"))
    if manifest.get("commit") != COMMIT:
        raise ValueError("The source pin does not match this launcher.")
    for relative, expected in manifest["sha256"].items():
        file = VENDOR / relative
        if file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(VENDOR.resolve()):
            raise ValueError("Pinned source is missing or redirected: " + relative)
        actual = hashlib.sha256(file.read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError("Pinned source checksum mismatch: " + relative)
    # Checksums detect unintended changes against this manifest. They do not
    # authenticate a manifest replaced together with the entire package.


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Run a local, read-only spyware-indicator scan after explicit consent. No upload or remote AI device access.")
    parser.add_argument("--preview", action="store_true", help="show the fixed scope without scanning")
    parser.add_argument("--backup", type=Path, help="an existing local AndroidQF collection or iPhone backup, instead of this computer")
    parser.add_argument("--encrypted-backup", action="store_true", help="ask privately for the selected iPhone backup password")
    args = parser.parse_args(argv)
    if sys.version_info < (3, 10):
        print("Python 3.10 or newer is required.", file=sys.stderr)
        return 1
    if args.encrypted_backup and not args.backup:
        parser.error("--encrypted-backup requires --backup")
    try:
        verify_source()
    except (OSError, ValueError, KeyError) as error:
        print("Source verification failed: " + str(error), file=sys.stderr)
        return 1
    target = str(args.backup.expanduser().resolve()) if args.backup else "this computer's standard supported locations"
    print("\nCOMPASS LOCAL SCAN — ZERO-BREACH-TOOLKIT")
    print("Pinned source: " + COMMIT)
    print("Target: " + target)
    print("Scope: supported saved browser/app records, startup and readable host records,")
    print("and bounded candidate-file fingerprints; or the selected existing phone backup.")
    print("No automatic update, live phone acquisition, upload, remediation, or elevation.")
    print("The scan can read sensitive local evidence. It writes temporary snapshots and reports.")
    print("Reports may contain private paths, browser details, or message excerpts. Keep them local.")
    print("A clean result is NOT a clean bill of health. Coverage gaps will be reported.")
    print("The scanner is not an operating-system sandbox. Use OS isolation for strict offline use.")
    if args.preview:
        print("Preview only. No device evidence was read or scan performed.")
        return 0
    if not sys.stdin.isatty():
        print("An interactive terminal is required for per-run consent. No scan started.", file=sys.stderr)
        return 1
    print("\nBy proceeding you confirm that you own or are authorized to inspect this target,")
    print("understand this scope, and authorize this local check. This grants no AI tool access.")
    if input("Type " + CONSENT_PHRASE + " to proceed, or press Enter to cancel: ").strip() != CONSENT_PHRASE:
        print("Cancelled. No scan started.")
        return 0
    os.umask(0o077)
    output = Path(tempfile.gettempdir()) / "compass-scans" / uuid.uuid4().hex
    output.mkdir(parents=True, exist_ok=False)
    record = {"consentVersion": CONSENT_VERSION, "timestampUtc": dt.datetime.now(dt.timezone.utc).isoformat(), "target": target, "purposes": ["local-read-only-spyware-indicator-check"], "upstreamCommit": COMMIT, "uploadAuthorized": False, "aiProcessingAuthorized": False}
    (output / "consent.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
    command = [sys.executable, "-I", "-X", "utf8", str(VENDOR / "scan" / "zero-breach-toolkit.py"), "--no-menu", "--no-banner", "--no-feeds", "--scan-type", "default", "--json", str(output / "full-report.json"), "--share-json", str(output / "sharing-summary.json")]
    if args.backup:
        command.extend(["--phone", target])
    if args.encrypted_backup:
        command.append("--backup-password")
    print("\nRunning the fixed scan. Use Ctrl+C to stop. Local output: " + str(output))
    try:
        completed = subprocess.run(command, cwd=VENDOR, shell=False)
    except KeyboardInterrupt:
        print("Stopped. Review the local output and temporary-data cleanup before sharing anything.")
        return 1
    print("\nReports stay on this device. No AI agent or website has received them.")
    print("Review sharing-summary.json before separately authorizing any Compass review.")
    print("Exit codes: 0=no actionable known matches; 2=investigate; 3=incomplete coverage; 1=error.")
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
