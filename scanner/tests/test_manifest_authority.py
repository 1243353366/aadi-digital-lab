"""Approval is anchored in the trusted launcher, not supplied by a manifest."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("manifest_launcher", ROOT / "compass_scan.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class ManifestAuthorityTests(unittest.TestCase):
    def test_self_consistent_unapproved_manifest_is_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            forged = {"commit": launcher.COMMIT, "patchId": launcher.PATCH_ID, "sha256": {}}
            (path / "source-manifest.json").write_text(json.dumps(forged))
            with patch.object(launcher, "ROOT", path):
                with self.assertRaisesRegex(ValueError, "not the one approved"):
                    launcher.verify_source()

    def test_one_byte_manifest_change_is_refused_before_source_use(self):
        raw = (ROOT / "source-manifest.json").read_bytes()
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            (path / "source-manifest.json").write_bytes(raw + b" ")
            with patch.object(launcher, "ROOT", path):
                with self.assertRaisesRegex(ValueError, "not the one approved"):
                    launcher.verify_source()


if __name__ == "__main__":
    unittest.main()
