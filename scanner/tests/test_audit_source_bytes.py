"""The audit must not trust timestamp-matched bytecode beside verified source."""
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import audit_scanner


class AuditSourceBytesTests(unittest.TestCase):
    def test_loader_exec_is_not_used_for_approved_module(self):
        real_spec = importlib.util.spec_from_file_location
        loaders = []
        def spec_without_loader_execution(name, path):
            spec = real_spec(name, path)
            spec.loader.exec_module = Mock(side_effect=AssertionError("cached loader execution forbidden"))
            loaders.append(spec.loader)
            return spec
        module_path = audit_scanner.compass_scan.VENDOR / "scan" / "zbtriage" / "result.py"
        with patch.object(audit_scanner.importlib.util, "spec_from_file_location", spec_without_loader_execution):
            module = audit_scanner.trusted_module("_source_only_regression", module_path)
        self.assertTrue(hasattr(module, "ModuleResult"))
        loaders[0].exec_module.assert_not_called()


if __name__ == "__main__":
    unittest.main()
