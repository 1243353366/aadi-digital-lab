# Compass local scanner

After downloading or cloning this repository, open a terminal in its root and run:

```bash
python3 scanner/compass_scan.py
```

On Windows, use `py -3 scanner/compass_scan.py`. Python 3.10+ is required. No package installation is needed for the standard computer check.

This command launches a **real scan on the person's current live computer**, not a preview or report viewer. “Offline” means the scan makes no intentional network requests—not that the device must be offline or that only backups can be checked. Available checks and coverage are platform-dependent. **On this security branch, hardened browser copying fails closed when POSIX handle-relative/no-follow primitives are unavailable, including the current portable Windows path. Windows coverage must not be described as equivalent or certified; private copies can be retained with a reported gap when safe cleanup is unsupported.** Native Windows/macOS certification is not established by Linux fixtures.

The launcher shows its fixed read-only scope and requires the exact phrase `I AUTHORIZE THIS LOCAL SCAN` in an interactive terminal. After explicit consent, the scan starts without further workflow prompts. There is no `--yes` consent bypass or scheduled-scan enrollment. The person running it must own or be authorized to inspect the target.

To view the scope without reading device evidence:

```bash
python3 scanner/compass_scan.py --preview
```

For an already collected AndroidQF folder or local iPhone backup:

```bash
python3 scanner/compass_scan.py --backup /path/to/local/backup
```

An encrypted iPhone backup additionally needs `--encrypted-backup`; its password is entered privately. Live phone acquisition, Android USB enrollment, indicator downloading, remediation, privilege elevation, host discovery, remote-service probing, and experimental pattern scans are not part of this launcher.

## Scan the scanner, not the device

```bash
python3 scanner/audit_scanner.py
```

This separate audit verifies the approved package and runs 42 synthetic matching, evidence-grade, and coverage-state checks. It does not invoke normal device-scan entry points or rewrite a device verdict. The security patch changes safety behavior—unsafe snapshots and failed cleanup become explicit gaps—but does not alter indicator bytes, matching rules, or evidence-grade meanings.

Use `--json audit-report.json` to save a separate report in a new file outside the scanner source tree. Audit output cannot overwrite an existing file or become a device sharing summary. Exit `0` means checks passed, `2` means checks failed, and `1` means the audit could not complete; none is an infection verdict. See [audit findings](AUDIT.md), [security changes](SECURITY-CHANGELOG.md), and the [before/after demonstration](SECURITY-DEMONSTRATION.md). Related scanners share code/indicator lineage, so agreement is not independent corroboration. Passing fixtures cannot establish real-world error rates or eliminate every false alarm/miss.

## Local output and separate AI consent

Reports and a versioned consent record are written under a new directory in the operating system's temporary folder: `compass-scans/<random-id>/`. The terminal prints its location. `full-report.json` may contain private paths, browser details, or message excerpts. The separate `sharing-summary.json` contains aggregate counts/status, without raw artifact content.

Nothing is uploaded. Running the scanner does not authorize an AI agent to inspect the device or process the result. Review the minimal summary before selecting it in Compass. The website reads it locally and requires separate security-purpose consent plus authenticated administrator permission before submitting only allowlisted aggregate fields for bounded Agent/Director review. Summary review does not grant model-training or host/tool access.

Avoid cloud-synced evidence/output locations. Temporary copies can contain complete browser databases. Unknown ownership, interruption, changing sources, unsupported cleanup, or cleanup failure can leave private copies; those outcomes must be reported, not converted into a clean result. Stale names/timestamps/manifests are not authority to delete. No arbitrary rollback or system-restoration capability is added. This is not an operating-system sandbox; privileged or same-identity attackers remain a limitation. A clean result is **not a clean bill of health**.

## Provenance, trust, and licenses

The approved package is based on [Zero-Breach-Toolkit](https://github.com/interplains/Zero-Breach-Toolkit) commit `fd39f351dfa0f611be8f7f8b3ac7f189a1f18ada` (0.1.9), **plus** local patch `compass-scanner-security-2026-10-28-v1`. It is not misrepresented as an unchanged upstream release. Apache-2.0 `LICENSE`, `NOTICE`, indicator CC0 notice, and optional rule licenses are retained under `vendor/zero-breach/`; original IOC/rule/license bytes are unchanged.

`source-manifest.json` records the upstream pin, patch digest, and resulting file hashes. The launcher separately pins the approved manifest. A self-authored replacement manifest cannot authorize replacement code, but compromising the trusted application distribution/launcher remains outside this guarantee. **These hashes are not publisher signatures.** Obtain a trusted Git commit through an approved distribution channel.

The ordinary device launcher uses `--no-feeds` and makes no indicator-download request. For the separately invoked Toolkit updater/cache loader, only canonical source descriptors, immutable source commits, and hashes shipped in the reviewed application release are accepted. A syntactically valid list plus a matching digest from the same source/cache is not independent authentication. `--latest` and `--accept-shrink` cannot bypass approvals. New feed content requires a reviewed pin update; approved indicators can still be incomplete or semantically wrong. See [patch details](patches/README.md).

To reproduce into a **new** directory from a clean, reviewed checkout of the approved upstream commit:

```bash
python3 scripts/package_scanner.py /path/to/Zero-Breach-Toolkit \
  --output /path/to/NEW-scanner-package \
  --manifest /path/to/NEW-manifest.json
```

The packager applies the approved local patch without fetching or executing scanner code. Existing differing outputs are preserved, not overwritten. Running without `--output` verifies an identical existing package; it does not silently replace one.

Tests are synthetic only:

```bash
python3 -m unittest discover -s scanner/tests -v
PYTHONPATH=scanner/vendor/zero-breach/scan python3 -m pytest -q scanner/security_tests
```

`pytest` is a test-only dependency; it is not required for the device command. No real device scan is used to build or validate these changes. Authors, contributors, research publishers, and rule authors remain credited in the [root README](../README.md#authors-and-attribution), original notices, and downstream security changelog.
