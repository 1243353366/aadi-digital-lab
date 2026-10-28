#!/usr/bin/env python3
"""Audit scanner code with synthetic fixtures. Never scans a live device.

This is separate from compass_scan.py. It does not change detection logic,
indicator data, scan verdicts, or the original scanner's output.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from typing import Callable

import compass_scan

REFERENCE = {"repository": "https://github.com/interplains/zero-breach", "commit": "1c7e9b6df81ea45982ec7d0f4fb607ffbbd55e00"}
LIMIT = "Passing fixtures does not establish real-world false-positive/false-negative rates or certify a device as safe. The related scanners share code/data; agreement is not independent corroboration."


def trusted_module(name: str, file: Path):
    relative = file.relative_to(compass_scan.VENDOR).as_posix()
    expected = compass_scan.approved_manifest()["sha256"].get(relative)
    source = file.read_bytes()
    if expected is None or hashlib.sha256(source).hexdigest() != expected:
        raise ValueError("Refusing unapproved audit module bytes")
    spec = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    # Compile the already-hashed immutable bytes, never loader.exec_module:
    # cached .pyc files are not covered by the source approval manifest.
    exec(compile(source, str(file), "exec"), module.__dict__)
    return module


def run_audit() -> dict:
    # Integrity comes before importing the two reviewed, standard-library-only
    # modules. No arbitrary source/agent-selected code can be imported here.
    compass_scan.verify_source()
    package = compass_scan.VENDOR / "scan" / "zbtriage"
    iocs = trusted_module("_compass_audit_iocs", package / "iocs.py")
    result = trusted_module("_compass_audit_result", package / "result.py")
    checks = []

    def check(name: str, category: str, operation: Callable[[], bool]):
        try:
            passed = operation() is True
            checks.append({"name": name, "category": category, "passed": passed})
        except Exception as error:
            # Error type only: no source paths or device evidence are relayed.
            checks.append({"name": name, "category": category, "passed": False, "errorType": type(error).__name__})

    with tempfile.TemporaryDirectory(prefix="compass-scanner-audit-") as folder:
        root = Path(folder)
        counter = 0

        def load(lines: str, encoding="utf-8"):
            nonlocal counter
            counter += 1
            file = root / (str(counter) + ".txt")
            file.write_text(lines, encoding=encoding)
            return iocs.load(str(file))

        s = load("signal.example.invalid\tdelivery\tprimary\tsynthetic\n192.0.2.19\tcc\tprimary\tsynthetic\n")
        cases = [
            ("exact domain", "https://signal.example.invalid/path", ["signal.example.invalid"], "miss-regression"),
            ("real subdomain", "a.signal.example.invalid", ["signal.example.invalid"], "miss-regression"),
            ("uppercase caller normalization", "SIGNAL.EXAMPLE.INVALID", ["signal.example.invalid"], "miss-regression"),
            ("domain prefix trap", "notsignal.example.invalid", [], "false-alarm-regression"),
            ("hyphenated different host", "not-signal.example.invalid", [], "false-alarm-regression"),
            ("longer suffix trap", "signal.example.invalid.attacker.invalid", [], "false-alarm-regression"),
            ("different top-level label", "signal.example.invalidity", [], "false-alarm-regression"),
            ("exact address", "192.0.2.19", ["192.0.2.19"], "miss-regression"),
            ("address with port", "192.0.2.19:443", ["192.0.2.19"], "miss-regression"),
            ("address prefix trap", "1192.0.2.19", [], "false-alarm-regression"),
            ("address suffix trap", "192.0.2.199", [], "false-alarm-regression"),
            ("extra address component", "192.0.2.19.1", [], "false-alarm-regression"),
            ("near miss followed by real address", "1192.0.2.199 then 192.0.2.19", ["192.0.2.19"], "miss-regression"),
        ]
        for name, text, expected, category in cases:
            check(name, category, lambda t=text, e=expected: sorted(ind.value for ind in s.search(t.lower())) == sorted(e))
            check(name + " (bytes)", category, lambda t=text, e=expected: sorted(ind.value for ind in s.search_bytes(t.lower().encode())) == sorted(e))
        check("UTF-16LE known domain", "miss-regression", lambda: [x.value for x in s.search_bytes("signal.example.invalid".encode("utf-16-le"))] == ["signal.example.invalid"])
        check("UTF-16LE suffix trap", "false-alarm-regression", lambda: s.search_bytes("signal.example.invalid.attacker.invalid".encode("utf-16-le")) == [])
        child = load("parent.example.invalid\tdelivery\tprimary\tsynthetic\nchild.parent.example.invalid\tdelivery\tprimary\tsynthetic\n")
        check("parent-child record is not double-counted", "false-alarm-regression", lambda: [x.value for x in child.search("child.parent.example.invalid")] == ["child.parent.example.invalid"])
        check("standalone parent is not discarded", "miss-regression", lambda: len(child.search("child.parent.example.invalid and parent.example.invalid")) == 2)
        check("UTF-8 BOM preserves first indicator", "miss-regression", lambda: bool(load("signal.example.invalid\tdelivery\tprimary\tsynthetic\n", "utf-8-sig").search("signal.example.invalid")))

        def rejects(lines):
            try:
                load(lines)
            except iocs.IocError:
                return True
            return False

        check("empty indicator set is refused", "miss-regression", lambda: rejects("# no indicators\n"))
        check("invisible character corruption is refused", "miss-regression", lambda: rejects("sig\u200bnal.example.invalid\tdelivery\tprimary\tsynthetic\n"))
        check("no executed checks means UNKNOWN", "coverage-regression", lambda: result.ModuleResult("fixture").status == result.UNKNOWN)
        checked = result.ModuleResult("fixture")
        checked.ran("synthetic-check")
        check("completed no-hit check remains CLEAN", "coverage-regression", lambda: checked.status == result.CLEAN)
        checked.could_not_run("synthetic-gap", "fixture only")
        check("coverage gap remains PARTIAL", "coverage-regression", lambda: checked.status == result.PARTIAL)
        unknown = result.ModuleResult("fixture")
        unknown.could_not_run("synthetic-check", "fixture only")
        check("failed check never becomes CLEAN", "coverage-regression", lambda: unknown.status == result.UNKNOWN)
        check("cached reference is not serious evidence", "evidence-regression", lambda: result.is_serious(result.EV_REFERENCED) is False)
        check("known file sample remains serious evidence", "evidence-regression", lambda: result.is_serious(result.EV_ON_DISK) is True)
        check("persistence remains serious evidence", "evidence-regression", lambda: result.is_serious(result.EV_PERSISTENCE) is True)
        check("unknown grade is not silently harmless", "evidence-regression", lambda: result.is_serious("") is True)
        heuristic = result.ModuleResult("fixture")
        heuristic.ran("synthetic-check")
        heuristic.add_lead(result.Lead("fixture", "synthetic", "non-verdict lead"))
        check("heuristic lead does not create a finding", "false-alarm-regression", lambda: heuristic.status == result.CLEAN and not heuristic.hits)

    return {"auditType": "scanner-on-scanner-fixture-audit-v1", "targetCommit": compass_scan.COMMIT, "targetPatchId": compass_scan.PATCH_ID, "reference": REFERENCE, "passed": all(x["passed"] for x in checks), "checksRun": len(checks), "checks": checks, "deviceScanPerformed": False, "originalDetectionSemanticsModified": False, "originalScanResultsChanged": False, "limitation": LIMIT}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Audit the pinned scanner source and synthetic detection fixtures. No device scan. Original results are unchanged.")
    parser.add_argument("--json", type=Path, help="save this separate audit report locally")
    args = parser.parse_args(argv)
    try:
        report = run_audit()
        if args.json:
            if args.json.resolve().is_relative_to(Path(__file__).resolve().parent):
                raise ValueError("Audit output cannot be placed in the scanner source tree.")
            with args.json.open("x", encoding="utf-8") as file:
                file.write(json.dumps(report, indent=2) + "\n")
    except Exception as error:
        print("Scanner audit could not complete: " + type(error).__name__, file=sys.stderr)
        return 1
    print("SCANNER AUDIT " + ("PASSED" if report["passed"] else "FAILED") + f": {report['checksRun']} synthetic checks.")
    for check in report["checks"]:
        if not check["passed"]:
            print("Review required: " + check["name"])
    print("No device scan performed. Original scanner output/results unchanged.")
    print(LIMIT)
    return 0 if report["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
