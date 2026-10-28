"""Non-retaliatory launcher controls. State can deny work, never grant authority.

No sockets, remote targets, telemetry, permanent bans, or recursive cleanup.
These controls are not a sandbox against someone controlling this account.
"""
from __future__ import annotations
import os
from pathlib import Path
import stat
import sys

DEFAULT_RUNTIME_SECONDS = 1800
MAX_RUNTIME_SECONDS = 3600


class GuardDenied(ValueError):
    pass


def require_enabled():
    if os.environ.get("COMPASS_SCANNER_DISABLED", "").strip() == "1":
        raise GuardDenied("Scanner disabled by operator. No scan started.")


def checked_path(value):
    raw = os.fspath(value)
    if raw.startswith(("//", "\\\\")) or "://" in raw:
        raise GuardDenied("Remote addresses, URLs, and UNC/device paths are not scan targets.")
    path = Path(os.path.abspath(os.path.expanduser(raw)))
    # Inspect ancestors before canonicalization; resolving first hides links.
    for ancestor in reversed((path,) + tuple(path.parents)):
        info = ancestor.lstat()
        if stat.S_ISLNK(info.st_mode):
            aliases = {"/tmp": "/private/tmp", "/var": "/private/var", "/etc": "/private/etc"}
            alias = aliases.get(str(ancestor)) if sys.platform == "darwin" else None
            if not (alias and getattr(info, "st_uid", None) == 0
                    and os.path.realpath(ancestor) == alias):
                raise GuardDenied("Redirected paths are outside the launcher scope.")
        if getattr(info, "st_file_attributes", 0) & 0x400:
            raise GuardDenied("Reparse paths are outside the launcher scope.")
    if sys.platform == "win32":
        import ctypes
        drive = path.drive
        if len(drive) != 2 or ctypes.windll.kernel32.GetDriveTypeW(drive + "\\") not in (2, 3, 5, 6):
            raise GuardDenied("Drive is remote or its locality cannot be established.")
    return path.resolve()


def validate_backup(value):
    path = checked_path(value)
    info = path.stat()
    if not stat.S_ISDIR(info.st_mode):
        raise GuardDenied("Backup scope requires an existing local collection directory.")
    recognized = False
    # Only metadata is examined before consent, using the original readers'
    # entry markers. A marker is a format hint, not proof of authorization.
    for name in ("packages.json", "Manifest.plist"):
        marker = path / name
        try:
            marker_info = marker.lstat()
        except FileNotFoundError:
            continue
        if not stat.S_ISREG(marker_info.st_mode) or checked_path(marker).parent != path:
            raise GuardDenied("Collection entry marker is redirected or not a regular file.")
        recognized = True
    if not recognized:
        raise GuardDenied("Unrecognized collection: expected packages.json or Manifest.plist. No scan started.")
    return path, (info.st_dev, info.st_ino)


def recheck_backup(path, identity):
    current, now = validate_backup(path)
    if now != identity or current != path:
        raise GuardDenied("Backup identity changed after consent. Start again with the intended target.")


class SingleScan:
    """One advisory slot per OS account/temp root; never removes lock state.

    OS handle locks expire on process exit. The file's contents/age are not an
    approval record. Tampered/unsupported state refuses work, not punishment.
    """
    def __init__(self, temp_root):
        self.base = Path(temp_root)
        self.root = None
        self.fd = None
        self.dir_fd = None
        self.identity = None

    def __enter__(self):
        try:
            base = checked_path(self.base)
            root = base / ("compass-scans-" + str(os.getuid()) if hasattr(os, "getuid") else "compass-scans")
            try:
                root.mkdir(mode=0o700)
            except FileExistsError:
                pass
            self.root = checked_path(root)
            info = self.root.lstat()
            if not stat.S_ISDIR(info.st_mode):
                raise GuardDenied("Invalid local guard directory.")
            if hasattr(os, "getuid") and (info.st_uid != os.getuid() or info.st_mode & 0o077):
                raise GuardDenied("Guard state must be private and owned by this OS account.")
            self.identity = (info.st_dev, info.st_ino)
            flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NONBLOCK", 0)
            if os.name == "posix":
                self.dir_fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
                anchored = os.fstat(self.dir_fd)
                if (anchored.st_dev, anchored.st_ino) != self.identity:
                    raise GuardDenied("Guard directory identity changed.")
                self.fd = os.open("active.lock", flags, 0o600, dir_fd=self.dir_fd)
            elif os.name == "nt":
                lock = self.root / "active.lock"
                try:
                    previous = lock.lstat()
                except FileNotFoundError:
                    previous = None
                if previous is not None:
                    if not stat.S_ISREG(previous.st_mode) or checked_path(lock) != lock:
                        raise GuardDenied("Redirected lock state.")
                    self.fd = os.open(lock, flags & ~os.O_CREAT, 0o600)
                    current = os.fstat(self.fd)
                    if (current.st_dev, current.st_ino) != (previous.st_dev, previous.st_ino):
                        raise GuardDenied("Lock identity changed.")
                else:
                    self.fd = os.open(lock, flags | os.O_EXCL, 0o600)
            else:
                raise GuardDenied("Safe concurrency locking is unavailable on this platform.")
            info = os.fstat(self.fd)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                raise GuardDenied("Invalid concurrency state.")
            if hasattr(os, "getuid") and (info.st_uid != os.getuid() or info.st_mode & 0o077):
                raise GuardDenied("Concurrency state is not private to this account.")
            if os.name == "posix":
                import fcntl
                fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            else:
                import msvcrt
                if info.st_size == 0:
                    os.write(self.fd, b"0")
                os.lseek(self.fd, 0, os.SEEK_SET)
                msvcrt.locking(self.fd, msvcrt.LK_NBLCK, 1)
            self.recheck()
            return self
        except (OSError, ValueError):
            self.__exit__(None, None, None)
            raise GuardDenied("Scan slot unavailable or unsafe. Another scan may be active; retry after review.")

    def recheck(self):
        root = checked_path(self.root)
        info = root.stat()
        if root != self.root or (info.st_dev, info.st_ino) != self.identity:
            raise GuardDenied("Guard directory changed; no scan may start.")
        if hasattr(os, "getuid") and (info.st_uid != os.getuid() or info.st_mode & 0o077):
            raise GuardDenied("Guard directory is no longer private to this account.")

    def __exit__(self, *args):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None
        if self.dir_fd is not None:
            os.close(self.dir_fd)
            self.dir_fd = None
