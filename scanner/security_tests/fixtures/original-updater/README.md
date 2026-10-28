# Original updater provenance fixture

`update-iocs.py` is an unmodified copy of `scan/update-iocs.py` from the
[interplains/zero-breach](https://github.com/interplains/zero-breach) repository
at commit `1c7e9b6df81ea45982ec7d0f4fb607ffbbd55e00`.

- Upstream path: `scan/update-iocs.py`
- Git blob at that commit: `9e090d1587f922f2c34716cdbb8b9b3b507d0f8b`
- SHA-256 of this fixture: `4defdd41c426f492e41e7affa18b5a2761190d9a68bea7d622cd0ebc4e42da0d`
- Upstream license: Apache License 2.0 (`LICENSE` at the repository root)

This source-text fixture exists solely so
`test_original_updater_download_limits.py` can apply the local patch in a
temporary tree and inspect only the resulting `_fetch` function. The fixture is
never imported or executed as the updater. The same-author Apache-2.0 license
text and attribution are already retained under `scanner/vendor/zero-breach/`;
this fixture intentionally does not duplicate that license text.
