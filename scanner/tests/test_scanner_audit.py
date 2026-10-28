import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import audit_scanner as audit

class ScannerAuditTests(unittest.TestCase):
    def test_synthetic_audit_passes_without_device_execution(self):
        with patch.object(audit.compass_scan.subprocess, "run") as device_runner:
            report = audit.run_audit()
            device_runner.assert_not_called()
        self.assertTrue(report["passed"])
        self.assertEqual(report["checksRun"], 42)
        self.assertFalse(report["deviceScanPerformed"])
        self.assertFalse(report["originalScanResultsChanged"])

    def test_integrity_failure_prevents_source_import(self):
        with patch.object(audit.compass_scan, "verify_source", side_effect=ValueError("fixture")), patch.object(audit, "trusted_module") as importer:
            with self.assertRaises(ValueError):
                audit.run_audit()
            importer.assert_not_called()

    def test_audit_failure_does_not_become_a_device_verdict(self):
        report = {"passed": False, "checksRun": 1, "checks": [{"name": "synthetic failure", "passed": False}]}
        with patch.object(audit, "run_audit", return_value=report), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(audit.main([]), 2)

    def test_report_is_separate_and_will_not_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "audit.json"
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(audit.main(["--json", str(output)]), 0)
            self.assertEqual(json.loads(output.read_text())["auditType"], "scanner-on-scanner-fixture-audit-v1")
            before = output.read_bytes()
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(audit.main(["--json", str(output)]), 1)
            self.assertEqual(output.read_bytes(), before)

    def test_scanner_source_cannot_be_report_destination(self):
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(audit.main(["--json", str(audit.compass_scan.ROOT / "new-audit.json")]), 1)
        self.assertFalse((audit.compass_scan.ROOT / "new-audit.json").exists())

if __name__ == "__main__":
    unittest.main()
