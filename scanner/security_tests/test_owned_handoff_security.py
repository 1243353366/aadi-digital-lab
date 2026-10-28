"""Post-review ownership regressions, all with synthetic local evidence."""
import io
import os
from pathlib import Path
import sqlite3
import tarfile
import pytest
from zbtriage import ownedtemp, localpaths, iocs
from zbtriage.context import ScanContext
from zbtriage.ios_sources import IosEvidenceSource
from zbtriage.modules import browser
from zbtriage.result import CLEAN


def test_archive_plaintext_is_owned_and_cleaned(tmp_path, monkeypatch):
    monkeypatch.setattr(ownedtemp, "local_temp_dir", lambda: str(tmp_path))
    archive = tmp_path / "synthetic.tar"
    with tarfile.open(str(archive), "w") as output:
        member = tarfile.TarInfo("logs/fixture.plist")
        data = b"synthetic private artifact"
        member.size = len(data)
        output.addfile(member, io.BytesIO(data))
    gaps = []
    source = IosEvidenceSource(str(archive), "sysdiagnose", "", lambda c, r: gaps.append((c, r)),
                               lambda message: None, None, None, None, None)
    source.start()
    temp = Path(source.tmp)
    assert source.cached and all(Path(p).exists() for p in source.cached.values())
    source.close()
    assert not temp.exists()
    assert not any("cleanup" in reason for _, reason in gaps)


def test_owned_sqlite_open_rejects_root_substitution_and_closes_connection(tmp_path, monkeypatch):
    monkeypatch.setattr(ownedtemp, "local_temp_dir", lambda: str(tmp_path))
    owner = ownedtemp.OwnedSnapshot()
    path = Path(owner.path) / "copy.db"
    with os.fdopen(owner.create_file("copy.db"), "wb") as file:
        file.write(b"synthetic")
    class Connection:
        closed = False
        def close(self):
            self.closed = True
    connection = Connection()
    def substitute(*args, **kwargs):
        assert kwargs.get("uri") is True and "mode=ro" in args[0]
        os.rename(owner.path, owner.path + "-moved")
        os.mkdir(owner.path, 0o700)
        path.write_bytes(b"not the validated copy")
        return connection
    monkeypatch.setattr(sqlite3, "connect", substitute)
    try:
        with pytest.raises(PermissionError):
            localpaths.open_evidence_db(str(path), require_owned=True)
        assert connection.closed
        assert path.read_bytes() == b"not the validated copy"
    finally:
        owner.release()


def test_cookie_cleanup_failure_is_a_gap_not_clean(tmp_path, monkeypatch):
    monkeypatch.setattr(ownedtemp, "local_temp_dir", lambda: str(tmp_path))
    profile = tmp_path / "User Data" / "Default" / "Network"
    profile.mkdir(parents=True)
    with sqlite3.connect(str(profile / "Cookies")) as db:
        db.execute("CREATE TABLE cookies(host_key TEXT, name TEXT, creation_utc INTEGER)")
        db.execute("INSERT INTO cookies VALUES ('ordinary.invalid','fixture',13300000000000000)")
    indicators = tmp_path / "iocs.txt"
    indicators.write_text("synthetic-test.invalid\tdelivery\tprimary\tfixture\n")
    monkeypatch.setattr(browser, "CHROMIUM_ROOTS", [("fixture", str(tmp_path / "User Data"))])
    monkeypatch.setattr(browser, "FIREFOX_ROOTS", [])
    monkeypatch.setattr(browser, "LOCAL", str(tmp_path / "absent-local"))
    monkeypatch.setattr(browser, "ROAMING", str(tmp_path / "absent-roaming"))
    real_cleanup = browser._discard_snapshot
    def fail_after_safe_cleanup(path, con=None):
        real_cleanup(path, con)
        return False  # only the error path is simulated; no private residue left
    monkeypatch.setattr(browser, "_discard_snapshot", fail_after_safe_cleanup)
    result = browser.run(ScanContext(iocs=iocs.load(str(indicators)), emit=lambda message: None))
    assert result.status != CLEAN
    assert any(not check.ran and "cleanup" in check.reason for check in result.checks)
