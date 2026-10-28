# Reviewed scanner security patches

This directory contains downstream changes for the `security/scanner-recovery-trust-boundaries` branch of `1243353366/aadi-digital-lab`. It does not represent an upstream endorsement, a merged change to `main`, or a hosting deployment.

## Bundled Zero Breach Toolkit

`owned-state-and-feed-trust.patch` applies to [Zero-Breach-Toolkit](https://github.com/interplains/Zero-Breach-Toolkit) commit `fd39f351dfa0f611be8f7f8b3ac7f189a1f18ada`. The reviewed patch digest and purpose are recorded in `approval.json`. Its resulting package is under `scanner/vendor/zero-breach/`; `source-manifest.json` records both upstream provenance and the downstream patch, and the trusted launcher separately approves that manifest.

The patch covers ownership-bound/non-recursive temporary-copy cleanup, retained unverified stale/partial state, bounded/race-aware browser copies, private snapshot handoff checks, read-only SQLite connections, and release-pinned feed approval. The same helpers are included in rebuilt single-file source. Original detection data, third-party rules, software license, and NOTICE bytes remain unchanged.

The Toolkit updater **already** read at most `MAX_DOWNLOAD + 1` bytes. It was not the unbounded reader reported in original Zero Breach. This patch keeps the existing total bound and adds 64 KiB streaming reads, early invalid/oversized Content-Length refusal, unsupported-encoding refusal, and mocked-response tests. Missing or dishonest Content-Length cannot bypass the actual byte count. Timeout settings remain, but a socket timeout is not represented as a strict total wall-clock deadline.

A downloaded digest is not publisher authentication. Canonical source descriptors, immutable source commit pins, and expected hashes come from the reviewed application distribution, not downloaded state. `--latest` and `--accept-shrink` cannot promote unapproved content. New source revisions require a reviewed application pin update. This does not authenticate a distribution whose code and approval values are both replaced, or prove that an approved indicator is semantically correct.

Reproduction:

```bash
python3 scripts/package_scanner.py /path/to/clean-approved-upstream \
  --output /path/to/NEW-package --manifest /path/to/NEW-manifest.json
```

Existing differing outputs are preserved, not recursively removed or restored. No network or scanner execution is part of packaging. See [security changes](../SECURITY-CHANGELOG.md) and [demonstration](../SECURITY-DEMONSTRATION.md).

## Original Zero Breach updater

`original-updater-bounded-read.patch` is a **separate patch** for [original Zero Breach](https://github.com/interplains/zero-breach) commit `1c7e9b6df81ea45982ec7d0f4fb607ffbbd55e00`, specifically `scan/update-iocs.py`. It is not silently substituted for the bundled Toolkit.

The original `_fetch()` used unbounded `resp.read()` despite a 30-second timeout. The patch bounds actual response bytes, limits indicator and checksum responses separately, reads only bounded chunks, refuses oversized/invalid declared lengths or unsupported compression, and closes responses on refusal. Ordinary response bytes and the timeout are retained. Synthetic HTTP fixtures—not live services—demonstrate the limits.

Apply only to the matching reviewed original checkout, from that checkout's root:

```bash
git apply --check /absolute/path/to/original-updater-bounded-read.patch
git apply /absolute/path/to/original-updater-bounded-read.patch
```

The original updater's remote digest remains an integrity check, not independent publisher authentication. This focused resource patch does not claim to turn the original development-branch updater into a signed update system. Use approved releases and independent verification for original-updater trust decisions; do not treat a parser or matching same-source digest as approval.

Resource exhaustion in a separately invoked updater and poisoning of detection data are distinct from proving remote scanner code execution or self-propagation. No reconnaissance, host discovery, port scanning, service probing, autonomous targeting, or remediation is added.

## Credit

Original authors are ArchiveGenocide / archivegenocide.com ([interplains](https://github.com/interplains)), with upstream contributors and research/rule authors credited in the [root README](../../README.md#authors-and-attribution) and original notices. Downstream changes were requested by [1243353366](https://github.com/1243353366) and developed with Manus AI assistance. Source licenses and notices are retained. Handles are attribution links, not claims of endorsement or unsolicited review requests.
