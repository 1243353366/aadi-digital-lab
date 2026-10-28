"""Synthetic adversarial tests for descriptor-based snapshot copying.

These tests use only per-test temporary files. They do not inspect browser data,
run a scan, or require an elevated account.
"""

import errno
import os
import stat
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from zbtriage import snapshotcopy


_POSIX_OPENAT = (os.name != "nt" and hasattr(os, "O_NOFOLLOW")
                 and hasattr(os, "O_DIRECTORY") and hasattr(os, "O_NONBLOCK")
                 and os.open in os.supports_dir_fd and os.stat in os.supports_dir_fd)
pytestmark = pytest.mark.skipif(not _POSIX_OPENAT,
                                reason="requires POSIX no-follow directory descriptors")


def test_stable_file_is_byte_exact_private_and_registered_before_writes(tmp_path):
    source = tmp_path / "History"
    destination = tmp_path / "snapshot"
    payload = b"SQLite format 3\000" + os.urandom(100000)
    source.write_bytes(payload)
    registered = []

    def created(path, info):
        # The exclusive destination already exists but no source byte was written.
        current = os.stat(path)
        registered.append((path, info.st_dev, info.st_ino, info.st_size,
                           current.st_dev, current.st_ino, current.st_size))

    copied = snapshotcopy.copy_snapshot_file(str(source), str(destination),
                                             len(payload), on_created=created)

    assert copied == len(payload)
    assert destination.read_bytes() == payload
    assert stat.S_IMODE(destination.stat().st_mode) == 0o600
    assert registered == [(str(destination), destination.stat().st_dev,
                           destination.stat().st_ino, 0,
                           destination.stat().st_dev, destination.stat().st_ino, 0)]


def test_existing_destination_is_never_overwritten(tmp_path):
    source = tmp_path / "History"
    destination = tmp_path / "snapshot"
    source.write_bytes(b"source")
    destination.write_bytes(b"do not replace")

    with pytest.raises(FileExistsError):
        snapshotcopy.copy_snapshot_file(str(source), str(destination), 100)

    assert destination.read_bytes() == b"do not replace"


def test_callback_registers_partial_destination_before_a_write_failure(tmp_path, monkeypatch):
    source = tmp_path / "History"
    destination = tmp_path / "snapshot"
    source.write_bytes(b"source bytes")
    registered = []

    def created(path, info):
        registered.append((path, info.st_dev, info.st_ino, info.st_size))

    def fail_write(_fd, _data, _path):
        raise OSError(errno.EIO, "synthetic write failure")

    monkeypatch.setattr(snapshotcopy, "_sc_write_all", fail_write)
    with pytest.raises(OSError, match="synthetic write failure"):
        snapshotcopy.copy_snapshot_file(str(source), str(destination), 100,
                                        on_created=created)

    # The caller can now remove only this registered identity. The copier does
    # not broadly unlink a name that might have been substituted after failure.
    assert registered == [(str(destination), destination.stat().st_dev,
                           destination.stat().st_ino, 0)]
    assert destination.exists()
    assert destination.read_bytes() == b""


def test_permission_failure_opening_source_does_not_create_destination(tmp_path, monkeypatch):
    source = tmp_path / "History"
    destination = tmp_path / "snapshot"
    source.write_bytes(b"source")
    real_open = snapshotcopy.os.open

    def denied(path, flags, mode=0o777, *, dir_fd=None):
        if path == source.name and dir_fd is not None:
            raise PermissionError(errno.EACCES, "synthetic denied", str(source))
        return real_open(path, flags, mode, dir_fd=dir_fd)

    monkeypatch.setattr(snapshotcopy.os, "open", denied)
    with pytest.raises(PermissionError, match="synthetic denied"):
        snapshotcopy.copy_snapshot_file(str(source), str(destination), 100)

    assert not destination.exists()


def test_source_symlink_swap_after_validation_is_refused(tmp_path, monkeypatch):
    source = tmp_path / "History"
    destination = tmp_path / "snapshot"
    redirected = tmp_path / "not-browser-data"
    source.write_bytes(b"original bytes")
    redirected.write_bytes(b"redirected bytes")
    real_assert = snapshotcopy._sc_assert_source_stable
    calls = []

    def swap_then_assert(*args):
        calls.append(1)
        # The first assertion completes initial validation. Swap immediately
        # before the first read's assertion, so the opened descriptor is never
        # trusted by its old pathname.
        if len(calls) == 2:
            source.unlink()
            source.symlink_to(redirected)
        return real_assert(*args)

    monkeypatch.setattr(snapshotcopy, "_sc_assert_source_stable", swap_then_assert)
    with pytest.raises(PermissionError, match="symlink"):
        snapshotcopy.copy_snapshot_file(str(source), str(destination), 100)

    # The helper deliberately leaves a registered partial destination to its
    # trusted owner; no redirected source byte was written.
    assert destination.exists()
    assert destination.read_bytes() == b""


def test_source_regular_file_replacement_after_validation_is_detected(tmp_path, monkeypatch):
    source = tmp_path / "History"
    destination = tmp_path / "snapshot"
    replacement = tmp_path / "replacement"
    source.write_bytes(b"original bytes")
    replacement.write_bytes(b"new bytes")
    real_assert = snapshotcopy._sc_assert_source_stable
    calls = []

    def replace_then_assert(*args):
        calls.append(1)
        if len(calls) == 2:
            os.replace(str(replacement), str(source))
        return real_assert(*args)

    monkeypatch.setattr(snapshotcopy, "_sc_assert_source_stable", replace_then_assert)
    with pytest.raises(OSError, match="changed while|replaced or changed"):
        snapshotcopy.copy_snapshot_file(str(source), str(destination), 100)

    assert destination.exists()
    assert destination.read_bytes() == b""


def test_growth_during_read_is_detected_and_read_requests_stay_bounded(tmp_path, monkeypatch):
    source = tmp_path / "History"
    destination = tmp_path / "snapshot"
    payload = b"a" * (snapshotcopy._SC_COPY_CHUNK_BYTES + 19)
    source.write_bytes(payload)
    real_read = snapshotcopy.os.read
    requests = []

    def grow_after_read(fd, requested):
        data = real_read(fd, requested)
        requests.append(requested)
        if len(requests) == 1:
            with open(str(source), "ab") as changed:
                changed.write(b"attacker growth beyond validated size")
        return data

    monkeypatch.setattr(snapshotcopy.os, "read", grow_after_read)
    with pytest.raises(OSError, match="opened file changed"):
        snapshotcopy.copy_snapshot_file(str(source), str(destination), len(payload))

    assert requests == [snapshotcopy._SC_COPY_CHUNK_BYTES]
    assert destination.stat().st_size == snapshotcopy._SC_COPY_CHUNK_BYTES


def test_shrink_during_read_is_detected(tmp_path, monkeypatch):
    source = tmp_path / "History"
    destination = tmp_path / "snapshot"
    payload = b"a" * (snapshotcopy._SC_COPY_CHUNK_BYTES + 19)
    source.write_bytes(payload)
    real_read = snapshotcopy.os.read
    calls = []

    def shrink_after_read(fd, requested):
        data = real_read(fd, requested)
        calls.append(1)
        if len(calls) == 1:
            with open(str(source), "r+b") as changed:
                changed.truncate(3)
        return data

    monkeypatch.setattr(snapshotcopy.os, "read", shrink_after_read)
    with pytest.raises(OSError, match="opened file changed"):
        snapshotcopy.copy_snapshot_file(str(source), str(destination), len(payload))

    assert calls == [1]
    assert destination.stat().st_size == snapshotcopy._SC_COPY_CHUNK_BYTES


def test_hard_linked_source_is_refused(tmp_path):
    source = tmp_path / "History"
    alternate_name = tmp_path / "another-name"
    destination = tmp_path / "snapshot"
    source.write_bytes(b"content")
    os.link(str(source), str(alternate_name))

    with pytest.raises(PermissionError, match="hard-linked"):
        snapshotcopy.copy_snapshot_file(str(source), str(destination), 100)

    assert not destination.exists()


@pytest.mark.skipif(not hasattr(os, "mkfifo"), reason="mkfifo is unavailable")
def test_special_file_is_refused_without_opening_it(tmp_path):
    source = tmp_path / "fifo"
    destination = tmp_path / "snapshot"
    os.mkfifo(str(source))

    with pytest.raises(PermissionError, match="special filesystem entry"):
        snapshotcopy.copy_snapshot_file(str(source), str(destination), 100)

    assert not destination.exists()


@pytest.mark.parametrize("attributes,flags,reason", (
    (0x400, 0, "reparse point"),
    (0, snapshotcopy.SF_DATALESS, "cloud-only"),
    (snapshotcopy._CLOUD_ONLY_ATTRIBUTES, 0, "cloud-only"),
))
def test_reparse_and_cloud_only_metadata_are_refused(attributes, flags, reason):
    # This models the platform stat metadata that POSIX temporary files do not
    # carry, without accessing a real cloud location or browser data.
    info = SimpleNamespace(st_file_attributes=attributes, st_flags=flags)
    with pytest.raises(PermissionError, match=reason):
        snapshotcopy._sc_require_nonredirected_stat(info, "/synthetic")


def test_direct_destination_parent_replacement_is_detected(tmp_path, monkeypatch):
    source_parent = tmp_path / "source-parent"
    destination_parent = tmp_path / "destination-parent"
    source_parent.mkdir()
    destination_parent.mkdir()
    source = source_parent / "History"
    destination = destination_parent / "snapshot"
    source.write_bytes(b"stable source")
    moved_parent = tmp_path / "moved-destination-parent"
    real_assert = snapshotcopy._sc_assert_parent_stable
    destination_parent_checks = []

    def replace_parent_then_assert(fd, path, expected_identity, label):
        if label == "destination parent":
            destination_parent_checks.append(1)
            # The second direct-destination check occurs after exclusive output
            # creation but before the first read/write.
            if len(destination_parent_checks) == 2:
                os.rename(str(destination_parent), str(moved_parent))
                destination_parent.mkdir()
        return real_assert(fd, path, expected_identity, label)

    monkeypatch.setattr(snapshotcopy, "_sc_assert_parent_stable", replace_parent_then_assert)
    with pytest.raises(OSError, match="destination parent was replaced"):
        snapshotcopy.copy_snapshot_file(str(source), str(destination), 100)

    assert (moved_parent / "snapshot").exists()
    assert not destination.exists()


def test_anchored_destination_callback_uses_the_owner_descriptor(tmp_path):
    source = tmp_path / "History"
    destination_parent = tmp_path / "private-owner-root"
    destination = destination_parent / "snapshot"
    source.write_bytes(b"anchored bytes")
    destination_parent.mkdir()
    owner_fd = os.open(str(destination_parent), os.O_RDONLY | os.O_DIRECTORY)
    created = []

    def create_destination():
        fd = os.open(destination.name,
                     os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=owner_fd)
        # An OwnedSnapshot-style owner records exact identity before it hands
        # the new descriptor to the copier.
        created.append(os.fstat(fd))
        return fd

    try:
        copied = snapshotcopy.copy_snapshot_file(
            str(source), str(destination), 100, create_destination=create_destination)
    finally:
        os.close(owner_fd)

    assert copied == len(b"anchored bytes")
    assert destination.read_bytes() == b"anchored bytes"
    assert (created[0].st_dev, created[0].st_ino) == (destination.stat().st_dev,
                                                       destination.stat().st_ino)
