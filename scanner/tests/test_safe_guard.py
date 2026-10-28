import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import compass_scan as launcher
import local_guard as guard


class SafeGuardTests(unittest.TestCase):
    def test_operator_disable_never_launches(self):
        with patch.dict(os.environ, {"COMPASS_SCANNER_DISABLED": "1"}), patch.object(launcher.subprocess, "run") as run, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(launcher.main([]), 1)
            run.assert_not_called()

    def test_remote_or_redirected_backup_never_launches(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "backup").mkdir()
            (root / "alias").symlink_to(root / "backup", target_is_directory=True)
            for target in ("https://example.invalid", "//server/share", str(root / "alias"), str(root / "missing")):
                with self.subTest(target=target), patch.object(launcher.subprocess, "run") as run, contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(launcher.main(["--backup", target]), 1)
                    run.assert_not_called()

    def test_concurrency_slot_is_reversible_without_deleting_state(self):
        with tempfile.TemporaryDirectory() as folder:
            with guard.SingleScan(folder) as first:
                lock = first.root / "active.lock"
                with self.assertRaises(guard.GuardDenied):
                    with guard.SingleScan(folder):
                        self.fail("overlapping scan allowed")
                self.assertTrue(lock.exists())
            with guard.SingleScan(folder):
                self.assertTrue(lock.exists())

    def test_foreign_or_injected_lock_state_is_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            with guard.SingleScan(folder) as first:
                root = first.root
            (root / "active.lock").unlink()  # only our synthetic test fixture
            sentinel = Path(folder) / "untouched"
            sentinel.write_text("preserve me")
            (root / "active.lock").symlink_to(sentinel)
            with self.assertRaises(guard.GuardDenied):
                with guard.SingleScan(folder):
                    self.fail("redirected lock accepted")
            self.assertEqual(sentinel.read_text(), "preserve me")

    def test_backup_swap_after_consent_is_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "backup"
            path.mkdir()
            (path / "packages.json").write_text("[]")
            selected, identity = guard.validate_backup(path)
            path.rename(Path(folder) / "original")
            path.mkdir()
            (path / "packages.json").write_text("[]")
            with self.assertRaises(guard.GuardDenied):
                guard.recheck_backup(selected, identity)

    def test_unrelated_directory_is_not_a_collection(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(guard.GuardDenied):
                guard.validate_backup(folder)
            (Path(folder) / "packages.json").write_text("[]")
            selected, identity = guard.validate_backup(folder)
            self.assertEqual(selected, Path(folder).resolve())

    def test_guard_directory_permission_change_refuses_work(self):
        with tempfile.TemporaryDirectory() as folder:
            with guard.SingleScan(folder) as active:
                active.root.chmod(0o755)
                try:
                    with self.assertRaises(guard.GuardDenied):
                        active.recheck()
                finally:
                    active.root.chmod(0o700)

    def test_invalid_budget_never_launches(self):
        for budget in ("0", "3601", "-1"):
            with patch.object(launcher.subprocess, "run") as run, contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit):
                    launcher.main(["--max-runtime-seconds", budget])
                run.assert_not_called()

    def authorized_run(self, folder, side_effect=None, code=2):
        with patch.dict(os.environ, {"COMPASS_SCANNER_DISABLED": "0"}), patch.object(launcher.tempfile, "gettempdir", return_value=folder), patch.object(launcher.sys.stdin, "isatty", return_value=True), patch("builtins.input", return_value=launcher.CONSENT_PHRASE), patch.object(launcher.subprocess, "run", side_effect=side_effect, return_value=subprocess.CompletedProcess([], code)) as run, contextlib.redirect_stdout(io.StringIO()):
            result = launcher.main(["--max-runtime-seconds", "30"])
        return result, run

    def test_authorized_verdict_is_preserved_and_execution_is_bounded(self):
        with tempfile.TemporaryDirectory() as folder:
            result, run = self.authorized_run(folder)
            self.assertEqual(result, 2)
            self.assertEqual(run.call_args.kwargs["timeout"], 30)
            self.assertFalse(run.call_args.kwargs["shell"])
            command = run.call_args.args[0]
            self.assertIn("--no-feeds", command)
            self.assertNotIn("--latest", command)
            events = list(Path(folder).rglob("guard-events.json"))
            self.assertEqual(len(events), 1)
            event = json.loads(events[0].read_text())
            self.assertFalse(event["telemetrySent"])
            self.assertEqual(event["intentAssessment"], "not-performed")

    def test_timeout_is_incomplete_not_a_clean_or_malicious_verdict(self):
        with tempfile.TemporaryDirectory() as folder:
            error = subprocess.TimeoutExpired("mock-owned-child", 30)
            result, run = self.authorized_run(folder, side_effect=error)
            self.assertEqual(result, 3)
            self.assertEqual(run.call_count, 1)
            event = json.loads(next(Path(folder).rglob("guard-events.json")).read_text())
            self.assertEqual(event["event"], "runtime-limit")
            self.assertEqual(event["coverage"], "incomplete")
            self.assertEqual(event["intentAssessment"], "not-performed")
            self.assertEqual(list(Path(folder).rglob("sharing-summary.json")), [])
            with guard.SingleScan(folder):
                pass  # no permanent lock or ban after cancellation

    def test_process_umask_is_restored(self):
        with tempfile.TemporaryDirectory() as folder:
            before = os.umask(0o077)
            os.umask(before)
            self.authorized_run(folder)
            after = os.umask(before)
            self.assertEqual(after, before)


if __name__ == "__main__":
    unittest.main()
