"""Conservative descriptor-based copying for short-lived private snapshots.

``path_problem`` is deliberately used as an early locality/redirection check, but
it is not an OS sandbox and cannot make an ancestor path immune to a concurrent
same-user rename. On POSIX platforms with the needed descriptor APIs this module
narrows that race: it holds the source parent open, opens the source entry
relative to that parent without following its final component, and compares the
named entry to the opened handle throughout the copy.

For a direct destination path the destination parent is also held and checked.
A caller that already owns an open private temporary root can use
``create_destination`` instead, avoiding any destination-root path resolution
between validation and exclusive creation. Windows' portable ``os.open`` API
does not provide equivalent no-follow directory-handle operations, so this
helper fails closed there rather than claiming atomicity it cannot provide.
"""

import errno
import os
import stat

from .localpaths import SF_DATALESS, _CLOUD_ONLY_ATTRIBUTES, path_problem


# A fixed, modest read size prevents an attacker-controlled file size from
# becoming an unbounded allocation. The caller's remaining-byte allowance is
# also applied to every os.read call.
_SC_COPY_CHUNK_BYTES = 64 * 1024
# Capture the platform capability at import time. Tests and callers may wrap
# os.open to model a permission failure; that must not change the platform's
# already-established openat capability.
_SC_OPEN_SUPPORTS_DIR_FD = os.open in os.supports_dir_fd
_SC_STAT_SUPPORTS_DIR_FD = os.stat in os.supports_dir_fd


def copy_snapshot_file(source, destination, remaining_bytes, on_created=None,
                       create_destination=None):
    """Copy one stable ordinary source to a new private destination.

    ``source`` and ``destination`` must be absolute text paths. The source must
    be a non-link, non-reparse, non-cloud-only regular file with exactly one
    link. The destination is created only once with ``O_CREAT | O_EXCL`` and
    mode 0600; an existing direct destination is never overwritten.

    In the direct path form, ``on_created(destination, stat_result)`` is called
    after the private destination descriptor exists but before source bytes are
    written. A caller can therefore record the exact ``st_dev``/``st_ino`` for
    cleanup even if a subsequent write fails.

    An owner of an already-open private destination directory may instead pass
    ``create_destination``. It is a no-argument trusted callback that returns a
    newly, exclusively created private destination descriptor and records its
    cleanup identity before returning. This form is intentionally mutually
    exclusive with ``on_created`` and does not re-resolve the destination root
    to create or check the output name.

    ``remaining_bytes`` is both the initial file-size ceiling and a ceiling
    applied to every read. The return value is the copied byte count. This
    helper never deletes a failed partial destination; its registered owner must
    remove it by identity.
    """
    source = _sc_absolute_text_path(source, "source")
    destination = _sc_absolute_text_path(destination, "destination")
    if not isinstance(remaining_bytes, int) or isinstance(remaining_bytes, bool):
        raise TypeError("remaining_bytes must be an integer")
    if remaining_bytes < 0:
        raise ValueError("remaining_bytes must not be negative")
    if _sc_same_path(source, destination):
        raise ValueError("source and destination must be different paths")
    if on_created is not None and not callable(on_created):
        raise TypeError("on_created must be callable or None")
    if create_destination is not None and not callable(create_destination):
        raise TypeError("create_destination must be callable or None")
    if on_created is not None and create_destination is not None:
        raise ValueError("on_created and create_destination cannot both be used")

    _sc_require_safe_posix_openat()

    # This is an early refusal of known redirections/cloud paths, not a claim of
    # atomic ancestry validation. Descriptor checks below remain required.
    _sc_check_path_problem(source)
    _sc_check_path_problem(destination)

    source_parent_path, source_name = _sc_parent_and_name(source, "source")
    destination_parent_path, destination_name = _sc_parent_and_name(destination,
                                                                    "destination")
    source_parent_fd = None
    destination_parent_fd = None
    source_fd = None
    destination_fd = None
    copied = 0
    try:
        source_parent_fd, source_parent_sc_identity = _sc_open_stable_parent(
            source_parent_path, "source parent")
        if create_destination is None:
            destination_parent_fd, destination_parent_sc_identity = _sc_open_stable_parent(
                destination_parent_path, "destination parent")
        else:
            destination_parent_sc_identity = None

        # lstat the name from the held parent before opening it. The fstat on
        # the resulting descriptor must match this state and every later state,
        # so a replacement before/during open fails rather than being copied.
        source_name_before = _sc_stat_at(source_parent_fd, source_name)
        _sc_require_safe_source_stat(source_name_before, source)
        source_fd = os.open(source_name, _sc_source_open_flags(),
                            dir_fd=source_parent_fd)
        source_handle_before = os.fstat(source_fd)
        _sc_require_safe_source_stat(source_handle_before, source)
        if _sc_source_snapshot(source_name_before) != _sc_source_snapshot(source_handle_before):
            _sc_changed(source, "path and opened handle did not identify the same file")

        _sc_assert_source_stable(source_fd, source_parent_fd, source_name, source,
                              source_handle_before, source_parent_path,
                              source_parent_sc_identity)
        if create_destination is None:
            _sc_assert_parent_stable(destination_parent_fd, destination_parent_path,
                                  destination_parent_sc_identity, "destination parent")

        source_size = source_handle_before.st_size
        if source_size > remaining_bytes:
            raise OSError(errno.EFBIG,
                          "source is {} bytes, over the remaining {}-byte snapshot limit".format(
                              source_size, remaining_bytes), source)

        if create_destination is None:
            # O_EXCL makes this an atomic "new name only" operation. O_NOFOLLOW
            # retains an explicit no-link policy for the final component.
            destination_fd = os.open(destination_name, _sc_destination_open_flags(),
                                     0o600, dir_fd=destination_parent_fd)
            # Register immediately after exclusive creation, before any source
            # byte is read or written. The 0600 creation mode may be further
            # restricted by umask, never broadened; fchmod below makes it exact.
            if on_created is not None:
                on_created(destination, os.fstat(destination_fd))
        else:
            destination_fd = create_destination()
            if not isinstance(destination_fd, int) or isinstance(destination_fd, bool):
                raise TypeError("create_destination must return an open file descriptor")

        # Only this newly-created descriptor is chmodded; the source is never
        # chmodded, elevated, restored, or otherwise modified.
        os.fchmod(destination_fd, 0o600)
        destination_initial = os.fstat(destination_fd)
        _sc_require_private_destination_stat(destination_initial, destination)
        if create_destination is None:
            _sc_assert_destination_stable(destination_fd, destination_parent_fd,
                                       destination_name, destination,
                                       destination_initial)
        else:
            _sc_assert_destination_handle_stable(destination_fd, destination,
                                              destination_initial)

        # The requested read is capped by the initial stable source size and
        # remaining allowance. It cannot temporarily consume newly grown bytes.
        while copied < source_size:
            _sc_assert_source_stable(source_fd, source_parent_fd, source_name, source,
                                  source_handle_before, source_parent_path,
                                  source_parent_sc_identity)
            if create_destination is None:
                _sc_assert_parent_stable(destination_parent_fd, destination_parent_path,
                                      destination_parent_sc_identity, "destination parent")
            expected_left = source_size - copied
            allowed_left = remaining_bytes - copied
            read_size = min(_SC_COPY_CHUNK_BYTES, expected_left, allowed_left)
            if read_size <= 0:
                raise OSError(errno.EFBIG,
                              "remaining snapshot limit was reached during copy", source)
            data = os.read(source_fd, read_size)
            if not data:
                _sc_changed(source, "file shrank while it was being copied")
            # os.read cannot normally return more than requested. Treat a
            # mocked/nonstandard result as a security failure instead of writing
            # a byte beyond either validated boundary.
            if len(data) > read_size or len(data) > expected_left or len(data) > allowed_left:
                _sc_changed(source, "copy attempted to exceed its validated byte limit")
            _sc_write_all(destination_fd, data, destination)
            copied += len(data)
            _sc_assert_source_stable(source_fd, source_parent_fd, source_name, source,
                                  source_handle_before, source_parent_path,
                                  source_parent_sc_identity)
            if create_destination is None:
                _sc_assert_destination_stable(destination_fd, destination_parent_fd,
                                           destination_name, destination,
                                           destination_initial)
            else:
                _sc_assert_destination_handle_stable(destination_fd, destination,
                                                  destination_initial)

        # A final source check catches a change that happened just after the
        # final expected chunk, including a late growth or path replacement.
        _sc_assert_source_stable(source_fd, source_parent_fd, source_name, source,
                              source_handle_before, source_parent_path,
                              source_parent_sc_identity)
        if create_destination is None:
            _sc_assert_parent_stable(destination_parent_fd, destination_parent_path,
                                  destination_parent_sc_identity, "destination parent")
            _sc_assert_destination_stable(destination_fd, destination_parent_fd,
                                       destination_name, destination,
                                       destination_initial)
        else:
            _sc_assert_destination_handle_stable(destination_fd, destination,
                                              destination_initial)
        return copied
    finally:
        _sc_close_quietly(destination_fd)
        _sc_close_quietly(source_fd)
        _sc_close_quietly(destination_parent_fd)
        _sc_close_quietly(source_parent_fd)


def _sc_absolute_text_path(value, label):
    """Return an absolute text path without accepting an ambient-CWD path."""
    value = os.fspath(value)
    if not isinstance(value, str):
        raise TypeError("{} must be a text path".format(label))
    if not os.path.isabs(value):
        raise ValueError("{} path must be absolute".format(label))
    return value


def _sc_same_path(first, second):
    """Compare lexical paths only; descriptor comparisons establish identity."""
    return os.path.normcase(os.path.normpath(first)) == os.path.normcase(os.path.normpath(second))


def _sc_check_path_problem(path):
    problem = path_problem(path)
    if problem:
        raise PermissionError(errno.EPERM, problem, path)


def _sc_parent_and_name(path, label):
    parent, name = os.path.split(path)
    if not parent or not name or name in (os.curdir, os.pardir):
        raise ValueError("{} path must name a file below a parent directory".format(label))
    return parent, name


def _sc_require_safe_posix_openat():
    """Fail closed where portable Python cannot make the no-follow claim."""
    required_flags = ("O_NOFOLLOW", "O_DIRECTORY", "O_NONBLOCK")
    if os.name == "nt" or any(not hasattr(os, flag) for flag in required_flags):
        raise OSError(errno.ENOTSUP,
                      "safe no-follow descriptor snapshot copying is unavailable on this platform")
    if not _SC_OPEN_SUPPORTS_DIR_FD or not _SC_STAT_SUPPORTS_DIR_FD:
        raise OSError(errno.ENOTSUP,
                      "safe directory-descriptor snapshot copying is unavailable on this platform")


def _sc_parent_open_flags():
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    return flags


def _sc_source_open_flags():
    # O_NONBLOCK prevents a FIFO swapped in after lstat from blocking the scanner.
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    return flags


def _sc_destination_open_flags():
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    return flags


def _sc_open_stable_parent(path, label):
    """Open one non-link directory and bind its final path component to its fd."""
    before = os.lstat(path)
    if not stat.S_ISDIR(before.st_mode):
        _sc_refuse(path, "{} is not a real directory".format(label))
    _sc_require_nonredirected_stat(before, path)
    fd = os.open(path, _sc_parent_open_flags())
    try:
        opened = os.fstat(fd)
        if not stat.S_ISDIR(opened.st_mode):
            _sc_refuse(path, "{} opened as a non-directory".format(label))
        if _sc_identity(before) != _sc_identity(opened):
            _sc_changed(path, "{} changed while it was opened".format(label))
        after = os.lstat(path)
        if _sc_identity(opened) != _sc_identity(after):
            _sc_changed(path, "{} changed while it was opened".format(label))
        return fd, _sc_identity(opened)
    except BaseException:
        _sc_close_quietly(fd)
        raise


def _sc_assert_parent_stable(parent_fd, parent_path, expected_sc_identity, label):
    opened = os.fstat(parent_fd)
    named = os.lstat(parent_path)
    if not stat.S_ISDIR(opened.st_mode) or not stat.S_ISDIR(named.st_mode):
        _sc_changed(parent_path, "{} stopped naming a directory".format(label))
    if _sc_identity(opened) != expected_sc_identity or _sc_identity(named) != expected_sc_identity:
        _sc_changed(parent_path, "{} was replaced while copying".format(label))


def _sc_stat_at(parent_fd, name):
    return os.stat(name, dir_fd=parent_fd, follow_symlinks=False)


def _sc_assert_source_stable(source_fd, parent_fd, name, source_path, expected,
                          parent_path, parent_sc_identity):
    """Require all mandated source state values on path and open descriptor."""
    _sc_assert_parent_stable(parent_fd, parent_path, parent_sc_identity, "source parent")
    opened = os.fstat(source_fd)
    named = _sc_stat_at(parent_fd, name)
    # Check link/reparse/type before identity comparison, but delay the link
    # count until after it. A replace unlinks the old still-open descriptor
    # (nlink becomes zero); that is a replacement, not a pre-existing hardlink.
    _sc_require_safe_source_stat(opened, source_path, check_nlink=False)
    _sc_require_safe_source_stat(named, source_path, check_nlink=False)
    if _sc_source_snapshot(opened) != _sc_source_snapshot(expected):
        _sc_changed(source_path, "opened file changed while it was being copied")
    if _sc_source_snapshot(named) != _sc_source_snapshot(expected):
        _sc_changed(source_path, "path was replaced or changed while it was being copied")
    _sc_require_safe_source_stat(opened, source_path)
    _sc_require_safe_source_stat(named, source_path)


def _sc_require_safe_source_stat(info, path, check_nlink=True):
    """Reject entries that must never be opened/read as browser evidence."""
    _sc_require_nonredirected_stat(info, path)
    if stat.S_ISLNK(info.st_mode):
        _sc_refuse(path, "symlink was not opened")
    if not stat.S_ISREG(info.st_mode):
        _sc_refuse(path, "special filesystem entry was not opened")
    # Browser evidence should not arrive from an alternate hard-link name that
    # another process can replace independently from the inspected pathname.
    if check_nlink and getattr(info, "st_nlink", 1) != 1:
        _sc_refuse(path, "hard-linked file was not opened")


def _sc_require_nonredirected_stat(info, path):
    attributes = getattr(info, "st_file_attributes", 0)
    if attributes & _CLOUD_ONLY_ATTRIBUTES or getattr(info, "st_flags", 0) & SF_DATALESS:
        _sc_refuse(path, "cloud-only file was not opened")
    if attributes & 0x400:
        _sc_refuse(path, "reparse point was not opened")


def _sc_require_private_destination_stat(info, path):
    if not stat.S_ISREG(info.st_mode):
        _sc_refuse(path, "new destination is not a regular file")
    if getattr(info, "st_nlink", 1) != 1:
        _sc_refuse(path, "new destination gained a hard link")
    if stat.S_IMODE(info.st_mode) != 0o600:
        _sc_refuse(path, "new destination is not private mode 0600")


def _sc_assert_destination_stable(destination_fd, parent_fd, name, path, expected):
    opened = os.fstat(destination_fd)
    named = _sc_stat_at(parent_fd, name)
    _sc_require_private_destination_stat(opened, path)
    _sc_require_private_destination_stat(named, path)
    if _sc_identity(opened) != _sc_identity(expected) or _sc_identity(named) != _sc_identity(expected):
        _sc_changed(path, "destination name was replaced while copying")


def _sc_assert_destination_handle_stable(destination_fd, path, expected):
    """Check the exact descriptor from an already-anchored trusted owner."""
    opened = os.fstat(destination_fd)
    _sc_require_private_destination_stat(opened, path)
    if _sc_identity(opened) != _sc_identity(expected):
        _sc_changed(path, "destination descriptor was replaced while copying")


def _sc_write_all(fd, data, path):
    offset = 0
    while offset < len(data):
        wrote = os.write(fd, data[offset:])
        if wrote is None or wrote <= 0 or wrote > len(data) - offset:
            raise OSError(errno.EIO, "could not write private snapshot", path)
        offset += wrote


def _sc_identity(info):
    return info.st_dev, info.st_ino


def _sc_source_snapshot(info):
    """The exact stable attributes compared on source path and handle."""
    return (info.st_dev, info.st_ino, info.st_size,
            getattr(info, "st_mtime_ns", int(info.st_mtime * 1000000000)),
            getattr(info, "st_ctime_ns", int(info.st_ctime * 1000000000)))


def _sc_changed(path, reason):
    raise OSError(errno.EBUSY, reason, path)


def _sc_refuse(path, reason):
    raise PermissionError(errno.EPERM, reason, path)


def _sc_close_quietly(fd):
    if fd is None:
        return
    try:
        os.close(fd)
    except OSError:
        pass
