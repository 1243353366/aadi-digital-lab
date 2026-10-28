"""Regression coverage for the standalone original IOC updater patch.

The tests deliberately do not import the fixture: it has updater imports and a
main program that are outside the downloader regression's scope.  Instead, they
apply the patch to a temporary copy, AST-extract just ``_fetch``, and execute
that function with in-memory urllib/ssl substitutes.  No real network request,
scanner entry point, or device read is possible from this test module.
"""
from __future__ import annotations

import ast
import copy
import shutil
import subprocess
import sys
import tempfile
import types
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "scanner/security_tests/fixtures/original-updater/update-iocs.py"
PATCH = ROOT / "scanner/patches/original-updater-bounded-read.patch"
UPSTREAM_SHA256 = (
    "4defdd41c426f492e41e7affa18b5a2761190d9a68bea7d622cd0ebc4e42da0d"
)


class FakeResponse:
    """In-memory context-managed response that records every requested read size."""

    def __init__(self, body, headers=None, ignore_requested_size=False):
        self._body = bytes(body)
        self._offset = 0
        self.headers = dict(headers or {})
        self.ignore_requested_size = ignore_requested_size
        self.read_sizes = []
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.closed = True
        return False

    def read(self, size=-1):
        self.read_sizes.append(size)
        if size is None or size < 0:
            raise AssertionError("the bounded downloader must never request an unbounded read")
        if self._offset >= len(self._body):
            return b""
        if self.ignore_requested_size:
            size = len(self._body) - self._offset
        result = self._body[self._offset:self._offset + size]
        self._offset += len(result)
        return result


class ReadFailureResponse(FakeResponse):
    """Response whose bounded read fails after the context manager has opened."""

    def read(self, size=-1):
        self.read_sizes.append(size)
        raise OSError("simulated response read failure")


class FakeRequest:
    def __init__(self, url, headers):
        self.url = url
        self.headers = headers


class FakeUrlOpen:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def __call__(self, request, *, timeout, context):
        self.calls.append((request, timeout, context))
        return self.response


@pytest.fixture(scope="module")
def patched_source():
    """Apply the checked-in patch to a temporary Git worktree copy of the fixture."""
    with tempfile.TemporaryDirectory(prefix="original-updater-test-") as tmp:
        tree = Path(tmp)
        source_path = tree / "scan/update-iocs.py"
        source_path.parent.mkdir()
        shutil.copyfile(FIXTURE, source_path)
        subprocess.run(["git", "init", "-q"], cwd=tree, check=True)
        subprocess.run(["git", "add", "scan/update-iocs.py"], cwd=tree, check=True)
        subprocess.run(
            ["git", "apply", "--check", str(PATCH)], cwd=tree, check=True,
            capture_output=True, text=True,
        )
        subprocess.run(
            ["git", "apply", str(PATCH)], cwd=tree, check=True,
            capture_output=True, text=True,
        )
        yield source_path.read_text(encoding="utf-8")


def _fetch_namespace(patched_source, response):
    """Compile only patched constants and `_fetch` using in-memory transports."""
    module = ast.parse(patched_source, filename="update-iocs.py")
    selected = [
        copy.deepcopy(node) for node in module.body
        if isinstance(node, ast.FunctionDef) and node.name == "_fetch"
    ]
    assert len(selected) == 1, "expected to extract _fetch only"
    urlopen = FakeUrlOpen(response)
    urllib = types.SimpleNamespace(
        request=types.SimpleNamespace(Request=FakeRequest, urlopen=urlopen)
    )
    ssl = types.SimpleNamespace(create_default_context=lambda: object())
    namespace = {
        "__name__": "extracted_fetch",
        "ssl": ssl,
        "urllib": urllib,
        "MAX_IOC_DOWNLOAD": 8 * 1024 * 1024,
        "MAX_CHECKSUM_DOWNLOAD": 4 * 1024,
        "DOWNLOAD_CHUNK_SIZE": 64 * 1024,
    }
    extracted = ast.Module(body=selected, type_ignores=[])
    ast.fix_missing_locations(extracted)
    exec(compile(extracted, "<ast-extracted-_fetch>", "exec"), namespace)
    return namespace, urlopen


def test_fixture_is_pinned_original_source_text_only():
    """Keep the fixture tied to the approved upstream commit, without executing it."""
    import hashlib

    assert hashlib.sha256(FIXTURE.read_bytes()).hexdigest() == UPSTREAM_SHA256
    text = FIXTURE.read_text(encoding="utf-8")
    assert "def _fetch(url, timeout=30):" in text
    assert "return resp.read()" in text


def test_fetch_ast_has_no_unbounded_read_and_keeps_timeout(patched_source):
    """The extracted patch must use sized reads and pass the original timeout through."""
    module = ast.parse(patched_source, filename="update-iocs.py")
    fetch = next(
        node for node in module.body
        if isinstance(node, ast.FunctionDef) and node.name == "_fetch"
    )
    read_calls = [
        node for node in ast.walk(fetch)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "read"
    ]
    assert read_calls
    assert all(call.args and not call.keywords for call in read_calls)
    assert isinstance(fetch.args.defaults[0], ast.Constant)
    assert fetch.args.defaults[0].value == 30

    response = FakeResponse(b"ordinary IOC bytes")
    namespace, urlopen = _fetch_namespace(patched_source, response)

    assert namespace["_fetch"]("https://example.invalid/iocs", timeout=17) == b"ordinary IOC bytes"
    assert response.read_sizes and all(isinstance(size, int) and size >= 0
                                      for size in response.read_sizes)
    assert urlopen.calls[0][1] == 17
    assert response.closed


def test_normal_bytes_are_unchanged_and_reads_are_chunked(patched_source):
    """A normal body is returned exactly, using bounded fixed-size reads."""
    body = (b"ioc-line\n" * 20_000) + b"last-line\n"
    response = FakeResponse(body, {"Content-Length": str(len(body))})
    namespace, _ = _fetch_namespace(patched_source, response)

    assert namespace["_fetch"]("https://example.invalid/iocs") == body
    assert response.closed
    assert len(response.read_sizes) > 1
    assert max(response.read_sizes) <= namespace["DOWNLOAD_CHUNK_SIZE"]


@pytest.mark.parametrize("headers", [
    {},
    {"Content-Length": "1"},
])
def test_actual_overflow_is_rejected_without_trusting_absent_or_lying_length(
        patched_source, headers):
    """Actual bytes cross the cap even when Content-Length is absent or falsely small."""
    response = FakeResponse(b"x" * 33, headers)
    namespace, _ = _fetch_namespace(patched_source, response)

    with pytest.raises(ValueError, match="exceeds 32 byte limit"):
        namespace["_fetch"]("https://example.invalid/iocs", max_bytes=32)

    assert response.closed
    assert max(response.read_sizes) <= 33  # cap + one-byte sentinel


def test_oversized_advertised_length_is_rejected_before_read(patched_source):
    """An explicitly oversized Content-Length is refused before body consumption."""
    response = FakeResponse(b"not consumed", {"Content-Length": "33"})
    namespace, _ = _fetch_namespace(patched_source, response)

    with pytest.raises(ValueError, match="exceeds 32 byte limit"):
        namespace["_fetch"]("https://example.invalid/iocs", max_bytes=32)

    assert response.read_sizes == []
    assert response.closed


@pytest.mark.parametrize("length", ["-1", "not-a-number"])
def test_malformed_or_negative_advertised_length_is_rejected_before_read(
        patched_source, length):
    response = FakeResponse(b"not consumed", {"Content-Length": length})
    namespace, _ = _fetch_namespace(patched_source, response)

    with pytest.raises(ValueError):
        namespace["_fetch"]("https://example.invalid/iocs", max_bytes=32)

    assert response.read_sizes == []
    assert response.closed


def test_unsupported_compression_is_rejected_before_read(patched_source):
    response = FakeResponse(b"not consumed", {"Content-Encoding": "gzip"})
    namespace, _ = _fetch_namespace(patched_source, response)

    with pytest.raises(ValueError, match="compressed"):
        namespace["_fetch"]("https://example.invalid/iocs")

    assert response.read_sizes == []
    assert response.closed


def test_response_is_closed_when_a_bounded_read_raises(patched_source):
    """The response context closes even if a bounded read itself fails."""
    response = ReadFailureResponse(b"unused")
    namespace, _ = _fetch_namespace(patched_source, response)

    with pytest.raises(OSError, match="simulated response read failure"):
        namespace["_fetch"]("https://example.invalid/iocs")

    assert response.read_sizes
    assert all(isinstance(size, int) and size >= 0 for size in response.read_sizes)
    assert response.closed


def test_checksum_uses_smaller_explicit_cap_at_its_call_site(patched_source):
    """The SHA-256 companion fetch is independently constrained to 4 KiB."""
    module = ast.parse(patched_source, filename="update-iocs.py")
    calls = [
        node for node in ast.walk(module)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "_fetch"
    ]
    keyword_values = {
        keyword.value.id
        for call in calls
        for keyword in call.keywords
        if keyword.arg == "max_bytes" and isinstance(keyword.value, ast.Name)
    }
    assert {"MAX_IOC_DOWNLOAD", "MAX_CHECKSUM_DOWNLOAD"} <= keyword_values

    response = FakeResponse(b"y" * 4097, {})
    namespace, _ = _fetch_namespace(patched_source, response)
    with pytest.raises(ValueError, match="exceeds 4096 byte limit"):
        namespace["_fetch"](
            "https://example.invalid/iocs.sha256",
            max_bytes=namespace["MAX_CHECKSUM_DOWNLOAD"],
        )
    assert response.closed
    assert max(response.read_sizes) <= namespace["MAX_CHECKSUM_DOWNLOAD"] + 1


def test_non_https_is_refused_without_opening_a_response(patched_source):
    response = FakeResponse(b"should not be read")
    namespace, urlopen = _fetch_namespace(patched_source, response)

    with pytest.raises(SystemExit, match="non-HTTPS"):
        namespace["_fetch"]("http://example.invalid/iocs")

    assert urlopen.calls == []
    assert not response.closed
