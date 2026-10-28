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

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from local_guard import (DEFAULT_RUNTIME_SECONDS, MAX_RUNTIME_SECONDS, GuardDenied,
                         SingleScan, require_enabled, validate_backup, recheck_backup)
VENDOR = ROOT / "vendor" / "zero-breach"
COMMIT = "fd39f351dfa0f611be8f7f8b3ac7f189a1f18ada"
PATCH_ID = "compass-scanner-security-2026-10-28-v1"
APPROVED_MANIFEST_SHA256 = "3e8b57ea460b319c2872197c2c52d224dd4fa7e183373464edd8593734d99b60"
CONSENT_VERSION = "compass-local-scan-v1"
CONSENT_PHRASE = "I AUTHORIZE THIS LOCAL SCAN"


def approved_manifest() -> dict:
    raw = (ROOT / "source-manifest.json").read_bytes()
    if hashlib.sha256(raw).hexdigest() != APPROVED_MANIFEST_SHA256:
        raise ValueError("Package manifest is not the one approved by this application release.")
    manifest = json.loads(raw)
    if manifest.get("commit") != COMMIT or manifest.get("patchId") != PATCH_ID:
        raise ValueError("The source pin does not match this launcher.")
    return manifest


def verify_source() -> None:
    manifest = approved_manifest()
    for relative, expected in manifest["sha256"].items():
        file = VENDOR / relative
        if file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(VENDOR.resolve()):
            raise ValueError("Pinned source is missing or redirected: " + relative)
        actual = hashlib.sha256(file.read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError("Pinned source checksum mismatch: " + relative)
    # The application approval is outside mutable source/cache metadata. This
    # is not a publisher signature, nor protection if the trusted launcher and
    # its approval constant are themselves replaced. Use a trusted Git commit.


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Run a local, read-only spyware-indicator scan after explicit consent. No upload or remote AI device access.")
    parser.add_argument("--preview", action="store_true", help="show the fixed scope without scanning")
    parser.add_argument("--backup", type=Path, help="an existing local AndroidQF collection or iPhone backup, instead of this computer")
    parser.add_argument("--encrypted-backup", action="store_true", help="ask privately for the selected iPhone backup password")
    parser.add_argument("--max-runtime-seconds", type=int, default=DEFAULT_RUNTIME_SECONDS,
                        help="stop only this scanner process after 1–3600 seconds (default 1800)")
    args = parser.parse_args(argv)
    if not 1 <= args.max_runtime_seconds <= MAX_RUNTIME_SECONDS:
        parser.error("--max-runtime-seconds must be between 1 and 3600")
    if sys.version_info < (3, 10):
        print("Python 3.10 or newer is required.", file=sys.stderr)
        return 1
    if args.encrypted_backup and not args.backup:
        parser.error("--encrypted-backup requires --backup")
    try:
        require_enabled()
        verify_source()
    except (OSError, ValueError, KeyError) as error:
        print("Source verification failed: " + str(error), file=sys.stderr)
        return 1
    try:
        backup, backup_identity = validate_backup(args.backup) if args.backup else (None, None)
    except (OSError, ValueError) as error:
        print("Scope refused: " + str(error) + ". No scan started.", file=sys.stderr)
        return 1
    target = str(backup) if backup else "this computer's standard supported locations"
    print("\nCOMPASS LOCAL SCAN — ZERO-BREACH-TOOLKIT")
    print("Upstream source: " + COMMIT + "; local security patch: " + PATCH_ID)
    print("Target: " + target)
    print("Scope: supported saved browser/app records, startup and readable host records,")
    print("and bounded candidate-file fingerprints; or the selected existing phone backup.")
    print("No automatic update, live phone acquisition, upload, remediation, or elevation.")
    print("The scan can read sensitive local evidence. It writes temporary snapshots and reports.")
    print("Reports may contain private paths, browser details, or message excerpts. Keep them local.")
    print("A clean result is NOT a clean bill of health. Coverage gaps will be reported.")
    print("The scanner is not an operating-system sandbox. Use OS isolation for strict offline use.")
    print("Safe guard: one active scan per local account/temp root; runtime cap " + str(args.max_runtime_seconds) + " seconds.")
    print("Violations stop our work only. No retaliation, telemetry, or intent classification.")
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
    previous_umask = os.umask(0o077)
    try:
        require_enabled()
        with SingleScan(tempfile.gettempdir()) as guard:
            if backup:
                recheck_backup(backup, backup_identity)
            output = Path(tempfile.mkdtemp(prefix="run-", dir=guard.root))
            guard.recheck()
            record = {"consentVersion": CONSENT_VERSION, "timestampUtc": dt.datetime.now(dt.timezone.utc).isoformat(), "target": target, "purposes": ["local-read-only-spyware-indicator-check"], "upstreamCommit": COMMIT, "localSecurityPatch": PATCH_ID, "uploadAuthorized": False, "aiProcessingAuthorized": False}
            (output / "consent.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
            # Fresh isolated bytecode location; never trust old package caches.
            command = [sys.executable, "-I", "-B", "-X", "utf8", "-X", "pycache_prefix=" + str(output / "python-cache"), str(VENDOR / "scan" / "zero-breach-toolkit.py"), "--no-menu", "--no-banner", "--no-feeds", "--scan-type", "default", "--json", str(output / "full-report.json"), "--share-json", str(output / "sharing-summary.json")]
            if backup:
                command.extend(["--phone", target])
            if args.encrypted_backup:
                command.append("--backup-password")
            print("\nRunning the fixed scan. Use Ctrl+C to stop. Local output: " + str(output))
            require_enabled()
            guard.recheck()
            if backup:
                recheck_backup(backup, backup_identity)
            event = {"policyVersion": "compass-safe-local-guard-v1", "event": "started", "intentAssessment": "not-performed", "maxRuntimeSeconds": args.max_runtime_seconds, "telemetrySent": False}
            event_file = output / "guard-events.json"
            event_file.write_text(json.dumps(event, indent=2), encoding="utf-8")
            try:
                # run() only cancels/waits for the child it created on timeout.
                completed = subprocess.run(command, cwd=VENDOR, shell=False,
                                           timeout=args.max_runtime_seconds)
            except (subprocess.TimeoutExpired, KeyboardInterrupt) as error:
                event["event"] = "runtime-limit" if isinstance(error, subprocess.TimeoutExpired) else "operator-cancelled"
                event["coverage"] = "incomplete"
                event_file.write_text(json.dumps(event, indent=2), encoding="utf-8")
                print("Stopped only this scanner's work. Coverage is incomplete. Preserve and review local output and possible private temporary copies.")
                return 3
            event["event"] = "finished"
            event["scannerExitCode"] = completed.returncode
            event_file.write_text(json.dumps(event, indent=2), encoding="utf-8")
            print("\nReports stay on this device. No AI agent or website has received them.")
            print("Review sharing-summary.json before separately authorizing any Compass review.")
            print("Exit codes: 0=no actionable known matches; 2=investigate; 3=incomplete coverage; 1=error.")
            return completed.returncode
    except (OSError, ValueError) as error:
        print("Safe guard refused further work: " + str(error), file=sys.stderr)
        return 1
    finally:
        os.umask(previous_umask)


if __name__ == "__main__":
    raise SystemExit(main())
