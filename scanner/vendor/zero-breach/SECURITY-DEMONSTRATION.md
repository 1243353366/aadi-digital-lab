# Recovery, machine-state, and feed-trust demonstration

## Scope

These are synthetic temporary-file tests, not a device scan. No real browser, phone, company evidence, system setting, or production deployment was inspected or changed. Original indicator data and evidence-grade semantics remain intact. The downstream patch is intended for the `security/scanner-recovery-trust-boundaries` branch of `1243353366/aadi-digital-lab`; it does not replace `main`.

## Confirmed before/after: untrusted cleanup state

A disposable directory named `bscan_forged-old-state` was created with an old timestamp, a synthetic important-file sentinel, and a forged `ownership.json` containing an asserted ownership flag and a fabricated restoration path. Both implementations were called **only** with the disposable test directory as their explicit base.

At original upstream `fd39f351dfa0f611be8f7f8b3ac7f189a1f18ada`:

```json
{"syntheticSentinelPreserved": false, "removed": 1, "reportedLeftovers": 0}
```

With the patch:

```json
{"syntheticSentinelPreserved": true, "removed": 0, "reportedLeftovers": 1}
```

The fix removes the automatic deletion grant. Prefix/age/owner observations and any file claiming authority are **not** interpreted as permission to delete or restore. The original `scan_recovery` routine only retains partial evidence; no system rollback operation is added by this patch.

## What the regression tests demonstrate

| Scenario | Required outcome |
| --- | --- |
| Arbitrary folder or forged ownership manifest | No cleanup authority; sentinel remains |
| Genuine current-process private copy | Delete only registered identities, without recursion |
| Root replaced by link or a different directory | Refuse cleanup; replacement and outside data remain |
| Unexpected child, changed identity, or link | Refuse rather than broaden deletion |
| Deletion error or unsupported handle primitives | Retain and report; do not report successful cleanup |
| Source swapped, changed, grown, shrunk, or replaced | Refuse unstable copy, with a bounded byte budget |
| WAL appears/changes or cannot be copied | Explicit incomplete-view warning; not full coverage |
| Evidence database disappears before connection | Read-only open fails; no empty database created |
| Attempted SQL write to an existing copy | Refused at connection/read-only policy boundary |
| Syntactically valid poisoned feed plus matching cache digest | A self-consistent cache does not grant approval |
| `--latest`, shrink override, missing trust pin, or forged source | Must not bypass the shipped approval boundary |
| Previously approved source bytes | Still eligible under the approved source/commit/hash |

Source byte copying is bounded and descriptor-aware; it is not a frozen or cryptographically attested image of a live machine. Group metadata checks reduce inconsistent views but cannot prove an atomic cross-file snapshot against a privileged/same-identity adversary.

## Reproduce in Digital Lab

From the branch checkout, using Python 3.10+:

```bash
python3 -m venv .security-venv
.security-venv/bin/python -m pip install pytest==8.4.2
PYTHONPATH=scanner/vendor/zero-breach/scan .security-venv/bin/python -m pytest -q scanner/security_tests
python3 -m unittest discover -s scanner/tests -v
python3 scanner/compass_scan.py --preview
```

The preview and fixture commands do not start a live-device scan. On Windows, use the virtual environment's `Scripts/python.exe` and set `PYTHONPATH` appropriately. The Linux fixtures are not native Windows certification; hardened snapshot copying fails closed where required handle operations are unavailable, and private temporary copies can remain with a reported gap.

The separate scanner audit remains `python3 scanner/audit_scanner.py`. Its report is not a device finding and cannot override original scan verdicts.

## Indicator authenticity boundary

A publisher-hosted digest accompanying a download establishes byte consistency only. Parsing a list proves format compatibility, not authenticity or semantic truth. Update/scan acceptance must compare with the source descriptor, immutable revision, and digest shipped in the **reviewed application release**, outside mutable downloaded/cache state. An untrusted list, cache manifest, count-change override, or latest flag cannot revise those approvals. New feed revisions require a reviewed approval/pin change in a trusted application release.

This does not prove that a research source is correct, nor protect a trusted application distribution whose code and approval values are both compromised. Publisher signatures, delegated key management, and a secure update-delivery system are not silently claimed to exist. The threat demonstrated is poisoned detection data affecting findings/coverage; it does not by itself demonstrate arbitrary code execution or a self-propagating worm.
