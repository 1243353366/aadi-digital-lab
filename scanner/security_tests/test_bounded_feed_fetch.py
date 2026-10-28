"""Synthetic HTTP responses only: no sockets or upstream requests are opened."""
import io
import pytest
from zbtriage import feeds
from zbtriage.iocs import IocError


class Response:
    def __init__(self, body, headers=None):
        self.stream = io.BytesIO(body)
        self.headers = headers or {}
        self.requests = []
        self.closed = False
    def __enter__(self):
        return self
    def __exit__(self, *args):
        self.closed = True
    def read(self, maximum):
        assert 0 < maximum <= 65536
        self.requests.append(maximum)
        return self.stream.read(maximum)


def fetch_response(monkeypatch, response, limit=8):
    monkeypatch.setattr(feeds, "MAX_DOWNLOAD", limit)
    calls = []
    class Opener:
        def open(self, request, timeout):
            calls.append(timeout)
            return response
    monkeypatch.setattr(feeds.urllib.request, "build_opener", lambda *args: Opener())
    return lambda: feeds._fetch(feeds.ALLOWED_PREFIXES[0] + "fixture.txt"), calls


def test_normal_bytes_and_timeout_are_preserved(monkeypatch):
    response = Response(b"normal")
    run, calls = fetch_response(monkeypatch, response)
    assert run() == b"normal"
    assert calls == [feeds.TIMEOUT_S]
    assert response.closed and all(n <= 9 for n in response.requests)


@pytest.mark.parametrize("headers", [{}, {"Content-Length": "1"}])
def test_actual_bytes_are_bounded_with_missing_or_lying_length(monkeypatch, headers):
    response = Response(b"x" * 1000, headers)
    run, _ = fetch_response(monkeypatch, response)
    with pytest.raises(IocError, match="larger"):
        run()
    assert response.closed
    assert response.stream.tell() == 9


@pytest.mark.parametrize("length", ["99999999999999999999999999999", "-1", "invalid"])
def test_advertised_oversize_or_invalid_length_is_rejected_before_body(monkeypatch, length):
    response = Response(b"x" * 1000, {"Content-Length": length})
    run, _ = fetch_response(monkeypatch, response)
    with pytest.raises(IocError):
        run()
    assert response.closed and response.requests == []


def test_exact_limit_and_empty_body_are_allowed(monkeypatch):
    for body in (b"", b"x" * 8):
        response = Response(body)
        run, _ = fetch_response(monkeypatch, response)
        assert run() == body
        assert response.closed


def test_unreviewed_compression_is_refused_before_body(monkeypatch):
    response = Response(b"encoded", {"Content-Encoding": "gzip"})
    run, _ = fetch_response(monkeypatch, response)
    with pytest.raises(IocError, match="encoded"):
        run()
    assert response.closed and response.requests == []
