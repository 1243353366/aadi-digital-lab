"""Group-level browser snapshot changes, using only synthetic temporary files."""
import os
from pathlib import Path
import pytest
from zbtriage.modules import browser
from zbtriage import ownedtemp


@pytest.fixture
def fixture(tmp_path, monkeypatch):
    monkeypatch.setattr(ownedtemp, "local_temp_dir", lambda: str(tmp_path))
    main = tmp_path / "History"
    main.write_bytes(b"synthetic database bytes")
    return main


def test_main_change_after_copy_refuses_snapshot(fixture, monkeypatch):
    original = browser.copy_snapshot_file
    def changing(source, target, budget, **kwargs):
        copied = original(source, target, budget, **kwargs)
        if source == str(fixture):
            fixture.write_bytes(b"changed after copy")
        return copied
    monkeypatch.setattr(browser, "copy_snapshot_file", changing)
    with pytest.raises(OSError, match="changed during snapshot"):
        browser.copy_locked(str(fixture))
    assert fixture.read_bytes() == b"changed after copy"


def test_new_sidecar_after_copy_is_a_gap(fixture, monkeypatch):
    original = browser.copy_snapshot_file
    def changing(source, target, budget, **kwargs):
        copied = original(source, target, budget, **kwargs)
        if source == str(fixture):
            Path(str(fixture) + "-wal").write_bytes(b"new unobserved records")
        return copied
    monkeypatch.setattr(browser, "copy_snapshot_file", changing)
    copied, issues = browser.copy_locked(str(fixture))
    try:
        assert any("-wal changed during snapshot" in issue for issue in issues)
    finally:
        browser._discard_snapshot(os.path.dirname(copied))


def test_failed_sidecar_copy_does_not_become_complete(fixture, monkeypatch):
    Path(str(fixture) + "-wal").write_bytes(b"synthetic WAL")
    original = browser.copy_snapshot_file
    def locking(source, target, budget, **kwargs):
        if source.endswith("-wal"):
            raise PermissionError("synthetic browser lock")
        return original(source, target, budget, **kwargs)
    monkeypatch.setattr(browser, "copy_snapshot_file", locking)
    copied, issues = browser.copy_locked(str(fixture))
    try:
        assert "could not copy -wal" in issues
        assert Path(copied).read_bytes() == fixture.read_bytes()
    finally:
        browser._discard_snapshot(os.path.dirname(copied))
