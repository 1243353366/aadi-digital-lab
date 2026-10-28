# Compass local scanner

After downloading or cloning this repository, open a terminal in its root and run:

```bash
python3 scanner/compass_scan.py
```

On Windows, use `py -3 scanner/compass_scan.py`. Python 3.10+ is required. No package installation is needed for the standard computer check.

This command launches a **real scan on the person's current live Windows, macOS, or Linux computer**. It is not just a preview or report viewer. “Offline” means the scan makes no intentional network requests—not that the device must be offline or that only backups can be checked.

The launcher shows its fixed read-only scope and requires the exact phrase `I AUTHORIZE THIS LOCAL SCAN` in an interactive terminal. After that explicit consent, the scan starts and runs to completion without further workflow prompts. There is no `--yes` consent bypass or scheduled scan enrollment. The person running it must own or be authorized to inspect the current device.

To view the scope without reading device evidence:

```bash
python3 scanner/compass_scan.py --preview
```

For an already collected AndroidQF folder or local iPhone backup:

```bash
python3 scanner/compass_scan.py --backup /path/to/local/backup
```

An encrypted iPhone backup additionally needs `--encrypted-backup`; its password is entered privately. Live phone acquisition, Android USB enrollment, indicator downloading, remediation, root elevation, and experimental pattern scans are not part of this launcher.

## Local output and separate AI consent

Reports and a versioned consent record are written under a new directory in the operating system's temporary folder: `compass-scans/<random-id>/`. The terminal prints the exact location. `full-report.json` may contain private paths, browser details, or message excerpts. It remains on the local device. The separate `sharing-summary.json` contains aggregate counts and a status, without raw artifact content.

Nothing is uploaded. Running the scanner does not authorize any AI agent to inspect the device or process the result. Review the minimal sharing summary before selecting it in the Compass website. The website reads it locally, then requires a separate security-purpose checkbox and authenticated administrator permission before submitting only allowlisted aggregate fields for bounded Agent/Director review. Summary review does not authorize model training or host/tool access.

Avoid cloud-synced evidence/output locations. Temporary snapshots can contain full browser database bytes; interrupted scans or cleanup failures may leave copies. The scanner is not an operating-system network sandbox. Use OS isolation when strict offline execution is required. A clean result is **not a clean bill of health**; matches warrant investigation, not a declaration of infection.

## Provenance and licenses

The vendored scanner is pinned to [Zero-Breach-Toolkit](https://github.com/interplains/Zero-Breach-Toolkit) commit `fd39f351dfa0f611be8f7f8b3ac7f189a1f18ada` (0.1.9). Its Apache-2.0 `LICENSE`, `NOTICE`, privacy documentation, indicator CC0 notice, and optional research-rule license notices are retained under `vendor/zero-breach/`. The launcher permits only the standard offline mode and ignores downloaded indicator caches.

`source-manifest.json` records SHA-256 checksums checked before launching. These detect changes relative to that manifest; they do not authenticate a package whose code and manifest were both replaced. Obtain this repository through a source you trust.

To reproduce the vendor package from a reviewed local checkout, run `python3 scripts/package_scanner.py /path/to/Zero-Breach-Toolkit`. The packager refuses any other revision and does not download code or run a scan.

Tests: `python3 -m unittest discover -s scanner/tests -v`. The tests exercise help, source checks, consent refusal/cancellation, and upstream metadata only. **No real device scan was performed as part of building this integration.**
