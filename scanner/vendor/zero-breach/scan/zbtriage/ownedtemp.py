"""Narrow cleanup authority for temporary copies created in this process.

No on-disk manifest, prefix, timestamp, scan content, or caller-supplied path
can grant deletion authority. Unsupported handle-relative platforms retain
copies and return False so the caller must report the privacy residue.
"""
import os
import stat
import tempfile

from .localpaths import local_temp_dir, path_problem


_LIVE = {}


def _identity(info):
    return (info.st_dev, info.st_ino)


def _plain(info, directory=False):
    expected = stat.S_ISDIR if directory else stat.S_ISREG
    return (expected(info.st_mode)
            and not getattr(info, "st_file_attributes", 0) & 0x400
            and (not hasattr(os, "getuid") or info.st_uid == os.getuid())
            and (directory or info.st_nlink == 1))


class OwnedSnapshot:
    """Own one private directory and only files created by this invocation."""

    def __init__(self, prefix="bscan_"):
        base = os.path.realpath(local_temp_dir())
        if path_problem(base):
            raise PermissionError("temporary root cannot be safely opened")
        self.path = tempfile.mkdtemp(prefix=prefix, dir=base)
        self.info = os.lstat(self.path)
        self.files = {}
        self.fd = None
        self.parent_fd = None
        self.closed = False
        self._anchored = (os.name == "posix" and hasattr(os, "O_NOFOLLOW")
                          and os.open in os.supports_dir_fd
                          and os.stat in os.supports_dir_fd
                          and os.unlink in os.supports_dir_fd
                          and os.rmdir in os.supports_dir_fd)
        if self._anchored:
            flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
            try:
                self.parent_fd = os.open(os.path.dirname(self.path), flags)
                self.fd = os.open(os.path.basename(self.path), flags,
                                  dir_fd=self.parent_fd)
                if _identity(os.fstat(self.fd)) != _identity(self.info):
                    raise PermissionError("temporary directory changed before ownership was established")
            except BaseException:
                self.release()
                raise
        if (not _plain(self.info, directory=True)
                or os.name == "posix" and self.info.st_mode & 0o077):
            self.release()
            raise PermissionError("temporary directory is not private and owned")
        _LIVE[self.path] = self

    def create_file(self, name):
        """Mint a private copy; never derive file names from evidence paths."""
        if (self.closed or name in ("", ".", "..") or os.path.basename(name) != name
                or "/" in name or "\\" in name or name in self.files):
            raise PermissionError("invalid or reused temporary-copy name")
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        if self._anchored:
            fd = os.open(name, flags, 0o600, dir_fd=self.fd)
        else:
            if path_problem(self.path) or _identity(os.lstat(self.path)) != _identity(self.info):
                raise PermissionError("temporary directory changed")
            fd = os.open(os.path.join(self.path, name), flags, 0o600)
        try:
            self.remember(os.path.join(self.path, name), os.fstat(fd))
        except BaseException:
            os.close(fd)
            raise
        return fd

    def remember(self, path, info):
        """Called with fstat from a newly exclusive-created destination handle."""
        if self.closed or os.path.dirname(os.path.abspath(path)) != self.path:
            raise PermissionError("copy does not belong to this temporary directory")
        name = os.path.basename(path)
        if name in ("", ".", "..") or not _plain(info):
            raise PermissionError("temporary copy identity is unsafe")
        if name in self.files and self.files[name] != _identity(info):
            raise PermissionError("temporary copy identity was replaced")
        self.files[name] = _identity(info)

    def validate_file(self, path):
        """Narrow pathname handoff; this is not a complete same-UID sandbox."""
        if self.closed or os.path.dirname(os.path.abspath(path)) != self.path:
            raise PermissionError("snapshot is not live or does not belong to this owner")
        if path_problem(self.path):
            raise PermissionError("snapshot root is redirected")
        root = os.lstat(self.path)
        if _identity(root) != _identity(self.info) or not _plain(root, True):
            raise PermissionError("snapshot root identity changed")
        name = os.path.basename(path)
        if name not in self.files:
            raise PermissionError("snapshot file has no current-process ownership record")
        info = os.lstat(path)
        if not _plain(info) or _identity(info) != self.files[name]:
            raise PermissionError("snapshot file identity changed")
        if self.fd is not None:
            anchored = os.stat(name, dir_fd=self.fd, follow_symlinks=False)
            if _identity(anchored) != self.files[name]:
                raise PermissionError("snapshot handle identity changed")

    def cleanup(self):
        """Unlink only recorded file identities through anchored directory handles.

        No recursion, restored paths, permission changes, or foreign file deletion.
        Refuse before deleting anything if the root or any child was replaced,
        redirected, hard-linked, or populated with an unowned child.
        """
        if self.closed:
            return not os.path.lexists(self.path)
        if not self._anchored or self.fd is None or self.parent_fd is None:
            self.release()
            return False
        try:
            root = os.stat(os.path.basename(self.path), dir_fd=self.parent_fd,
                           follow_symlinks=False)
            if (_identity(root) != _identity(self.info) or not _plain(root, True)
                    or root.st_mode & 0o077 or path_problem(self.path)):
                return False
            names = os.listdir(self.fd)
            if set(names) - set(self.files):
                return False
            for name in names:
                info = os.stat(name, dir_fd=self.fd, follow_symlinks=False)
                if not _plain(info) or _identity(info) != self.files[name]:
                    return False
            for name in names:
                # Recheck every file immediately before unlink. The parent is an
                # opened owned directory, not a path that can redirect elsewhere.
                info = os.stat(name, dir_fd=self.fd, follow_symlinks=False)
                if not _plain(info) or _identity(info) != self.files[name]:
                    return False
                os.unlink(name, dir_fd=self.fd)
            # rmdir is non-recursive; a changed or nonempty path cannot make us
            # traverse/delete a replacement tree.
            root = os.stat(os.path.basename(self.path), dir_fd=self.parent_fd,
                           follow_symlinks=False)
            if _identity(root) != _identity(self.info):
                return False
            os.rmdir(os.path.basename(self.path), dir_fd=self.parent_fd)
            return not os.path.lexists(self.path)
        except OSError:
            return False
        finally:
            self.release()

    def release(self):
        _LIVE.pop(self.path, None)
        for name in ("fd", "parent_fd"):
            value = getattr(self, name, None)
            if value is not None:
                os.close(value)
                setattr(self, name, None)
        self.closed = True


def discard_owned_snapshot(path):
    """Reject unknown paths, including stale/manually fabricated folders."""
    owner = _LIVE.get(os.path.abspath(os.fspath(path)))
    return owner.cleanup() if owner is not None else False


def validate_owned_snapshot_file(path):
    owner = _LIVE.get(os.path.dirname(os.path.abspath(os.fspath(path))))
    if owner is None:
        raise PermissionError("snapshot has no current-process owner")
    owner.validate_file(path)
