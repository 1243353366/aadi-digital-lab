"""Release pins, not a mutable source or cache manifest, authorize feed bytes."""
import hashlib
import json

import pytest

from zbtriage import feeds
from zbtriage.iocs import IocError


PIN = "a" * 40
SRC = {
    "id": "auth-test",
    "name": "Authentication test source",
    "url": "https://raw.githubusercontent.com/mvt-project/mvt-indicators/main/x/auth.stix2",
    "repo": "mvt-project/mvt-indicators",
    "path": "x/auth.stix2",
    "format": "stix2",
    "cite": "Synthetic test source",
    "category": "mercenary",
    "family": "",
}


def _stix(domain):
    return json.dumps({"type": "bundle", "objects": [{
        "type": "indicator", "id": "indicator--22222222-2222-4222-8222-222222222222",
        "pattern_type": "stix", "pattern": "[domain-name:value = '{}']".format(domain),
        "valid_from": "2026-10-28T00:00:00Z", "created": "2026-10-28T00:00:00Z",
        "modified": "2026-10-28T00:00:00Z",
    }]}).encode()


APPROVED = _stix("approved-list.invalid")
FORGED = _stix("forged-list.invalid")


@pytest.fixture
def release(monkeypatch):
    monkeypatch.setattr(feeds, "SOURCES", [SRC])
    monkeypatch.setattr(feeds, "FEED_PINS", {SRC["repo"]: PIN})
    monkeypatch.setattr(feeds, "FEED_FILE_SHA256", {
        SRC["id"]: hashlib.sha256(APPROVED).hexdigest(),
    })
    return SRC


def _no_fetch(_url):
    raise AssertionError("source authentication must refuse before fetch")


def test_known_release_approved_content_is_accepted(tmp_path, release):
    summary = feeds.update(str(tmp_path), sources=[release], fetch=lambda _url: APPROVED)
    assert summary["failed"] == 0
    loaded, status = feeds.cached_sets(str(tmp_path))
    assert [indicator.value for indicator in loaded[0].indicators] == ["approved-list.invalid"]
    assert status["loaded"][0]["pinned_for_this_release"] is True


def test_latest_is_refused_before_download_and_cannot_replace_approved_content(tmp_path, release):
    feeds.update(str(tmp_path), sources=[release], fetch=lambda _url: APPROVED)
    name = release["id"] + feeds._EXT[release["format"]]
    before = (tmp_path / name).read_bytes()

    with pytest.raises(IocError, match="latest cannot bypass release-approved indicator pins"):
        feeds.update(str(tmp_path), sources=[release], fetch=_no_fetch, latest=True)

    assert (tmp_path / name).read_bytes() == before


def test_forged_valid_list_and_matching_manifest_digest_are_refused_even_latest(tmp_path, release):
    feeds.update(str(tmp_path), sources=[release], fetch=lambda _url: APPROVED)
    name = release["id"] + feeds._EXT[release["format"]]
    (tmp_path / name).write_bytes(FORGED)
    manifest_path = tmp_path / feeds.MANIFEST
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["sources"][release["id"]]["sha256"] = hashlib.sha256(FORGED).hexdigest()
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    loaded, status = feeds.cached_sets(str(tmp_path), latest=True)
    assert loaded == []
    assert "not the copy approved for this release" in status["refused"][0]["reason"]


def test_matching_manifest_digest_does_not_overwrite_prior_approved_content(tmp_path, release):
    feeds.update(str(tmp_path), sources=[release], fetch=lambda _url: APPROVED)
    name = release["id"] + feeds._EXT[release["format"]]
    manifest_path = tmp_path / feeds.MANIFEST
    before_bytes = (tmp_path / name).read_bytes()
    before_manifest = manifest_path.read_bytes()

    summary = feeds.update(str(tmp_path), sources=[release], fetch=lambda _url: FORGED)

    assert summary["failed"] == 1
    assert summary["sources"][0]["kept_previous"] is True
    assert (tmp_path / name).read_bytes() == before_bytes
    assert manifest_path.read_bytes() == before_manifest


def test_missing_release_digest_is_denied_without_fetch(tmp_path, release, monkeypatch):
    monkeypatch.setattr(feeds, "FEED_FILE_SHA256", {})

    summary = feeds.update(str(tmp_path), sources=[release], fetch=_no_fetch)

    assert summary["failed"] == 1
    assert "no release-approved SHA-256 digest" in summary["sources"][0]["error"]


@pytest.mark.parametrize("forged", [
    dict(SRC, id="forged-id"),
    dict(SRC, url="https://raw.githubusercontent.com/mvt-project/mvt-indicators/main/x/other.stix2"),
])
def test_forged_descriptor_id_or_origin_is_denied_without_fetch(tmp_path, release, forged):
    summary = feeds.update(str(tmp_path), sources=[forged], fetch=_no_fetch)

    assert summary["failed"] == 1
    assert "release-approved source" in summary["sources"][0]["error"] or \
           "release-approved descriptor" in summary["sources"][0]["error"]


def test_accept_shrink_is_not_an_authentication_bypass(tmp_path, release):
    with pytest.raises(IocError, match="accept-shrink cannot authorize indicator content"):
        feeds.update(str(tmp_path), sources=[release], fetch=_no_fetch,
                     accept_shrink=[release["id"]])
