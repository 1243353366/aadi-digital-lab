import contextlib
import importlib.util
import io
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("compass_scan", ROOT / "compass_scan.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)

class LauncherTests(unittest.TestCase):
    def test_pinned_source_checksums(self):
        launcher.verify_source()

    def test_preview_never_starts_scanner(self):
        with patch.object(launcher.subprocess, "run") as run, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(launcher.main(["--preview"]), 0)
            run.assert_not_called()

    def test_noninteractive_input_refuses_to_scan(self):
        with patch.object(launcher.sys.stdin, "isatty", return_value=False), patch.object(launcher.subprocess, "run") as run, contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(launcher.main([]), 1)
            run.assert_not_called()

    def test_cancel_refuses_to_scan(self):
        with patch.object(launcher.sys.stdin, "isatty", return_value=True), patch("builtins.input", return_value=""), patch.object(launcher.subprocess, "run") as run, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(launcher.main([]), 0)
            run.assert_not_called()

    def test_no_yes_or_arbitrary_command_bypass(self):
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                launcher.main(["--yes"])
            with self.assertRaises(SystemExit):
                launcher.main(["--command", "anything"])

    def test_upstream_metadata_path_only(self):
        result = subprocess.run([sys.executable, "-I", str(launcher.VENDOR / "scan" / "zero-breach-toolkit.py"), "--describe", "--no-banner"], capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("schema_version", result.stdout)

if __name__ == "__main__":
    unittest.main()
