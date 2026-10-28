"""Adversarial cleanup fixtures: no real machine evidence is read or removed."""
import os
from pathlib import Path
import pytest
from zbtriage import ownedtemp, localpaths


@pytest.fixture
def owner(tmp_path, monkeypatch):
    monkeypatch.setattr(ownedtemp, "local_temp_dir", lambda: str(tmp_path))
    directory = ownedtemp.OwnedSnapshot()
    yield directory
    if not directory.closed:
        directory.release()


def private_copy(owner, name="copy.db", contents=b"synthetic"):
    with os.fdopen(owner.create_file(name), "wb") as file:
        file.write(contents)
    return Path(owner.path) / name


def test_arbitrary_directory_has_no_cleanup_authority(tmp_path):
    victim = tmp_path / "important"
    victim.mkdir()
    sentinel = victim / "do-not-delete"
    sentinel.write_bytes(b"original evidence")
    assert ownedtemp.discard_owned_snapshot(str(victim)) is False
    assert sentinel.read_bytes() == b"original evidence"


def test_normal_owned_copy_is_narrowly_cleaned(owner):
    if not owner._anchored:
        pytest.skip("descriptor-relative cleanup unavailable")
    private_copy(owner)
    assert ownedtemp.discard_owned_snapshot(owner.path)
    assert not os.path.lexists(owner.path)


def test_injected_unknown_file_stops_cleanup(owner):
    copy = private_copy(owner)
    unexpected = Path(owner.path) / "not-created-by-scanner"
    unexpected.write_bytes(b"preserve")
    assert not ownedtemp.discard_owned_snapshot(owner.path)
    assert unexpected.read_bytes() == b"preserve"
    assert copy.read_bytes() == b"synthetic"


@pytest.mark.skipif(os.name != "posix", reason="POSIX link fixture")
def test_root_symlink_replacement_does_not_touch_target(owner, tmp_path):
    private_copy(owner)
    moved = owner.path + "-moved"
    os.rename(owner.path, moved)
    victim = tmp_path / "victim"
    victim.mkdir()
    (victim / "important").write_bytes(b"preserve")
    os.symlink(victim, owner.path, target_is_directory=True)
    assert not ownedtemp.discard_owned_snapshot(owner.path)
    assert (victim / "important").read_bytes() == b"preserve"
    assert (Path(moved) / "copy.db").read_bytes() == b"synthetic"


def test_root_directory_replacement_does_not_touch_replacement(owner):
    private_copy(owner)
    os.rename(owner.path, owner.path + "-moved")
    os.mkdir(owner.path, 0o700)
    other = Path(owner.path) / "copy.db"
    other.write_bytes(b"not ours")
    assert not ownedtemp.discard_owned_snapshot(owner.path)
    assert other.read_bytes() == b"not ours"


@pytest.mark.skipif(os.name != "posix", reason="POSIX link fixture")
def test_child_symlink_never_follows_target(owner, tmp_path):
    copy = private_copy(owner)
    copy.unlink()
    sentinel = tmp_path / "unrelated"
    sentinel.write_bytes(b"preserve")
    copy.symlink_to(sentinel)
    assert not ownedtemp.discard_owned_snapshot(owner.path)
    assert sentinel.read_bytes() == b"preserve"
    assert copy.is_symlink()


def test_replaced_child_identity_is_not_deleted(owner):
    copy = private_copy(owner)
    copy.rename(Path(owner.path) / "saved-original")
    copy.write_bytes(b"foreign")
    assert not ownedtemp.discard_owned_snapshot(owner.path)
    assert copy.read_bytes() == b"foreign"


def test_cleanup_refusal_is_visible_not_reported_as_success(owner, monkeypatch):
    copy = private_copy(owner)
    if not owner._anchored:
        pytest.skip("descriptor-relative cleanup unavailable")
    real_unlink = os.unlink
    def fail(path, *args, **kwargs):
        if kwargs.get("dir_fd") is not None:
            raise PermissionError("synthetic open-file lock")
        return real_unlink(path, *args, **kwargs)
    monkeypatch.setattr(os, "unlink", fail)
    assert not ownedtemp.discard_owned_snapshot(owner.path)
    assert copy.exists()


def test_no_handle_relative_support_retains_copies(owner):
    copy = private_copy(owner)
    owner._anchored = False
    assert not ownedtemp.discard_owned_snapshot(owner.path)
    assert copy.read_bytes() == b"synthetic"


def test_stale_candidate_manifest_does_not_grant_authority(tmp_path):
    candidate = tmp_path / "bscan_forged"
    candidate.mkdir()
    (candidate / "ownership.json").write_text('{"owned":true,"restore":"/"}')
    (candidate / "original.db").write_bytes(b"preserve")
    os.utime(str(candidate), (1, 1))
    result = localpaths.sweep_stale_temp(base=str(tmp_path), now=9999999999)
    assert result["removed"] == 0
    assert str(candidate) in result["failed"]
    assert (candidate / "original.db").read_bytes() == b"preserve"


def test_traversal_file_name_cannot_escape_owned_root(owner, tmp_path):
    with pytest.raises(PermissionError):
        owner.create_file("../outside")
    assert not (tmp_path / "outside").exists()
