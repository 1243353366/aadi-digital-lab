# Scanner-on-scanner audit

The original device scan is unchanged. The new `python3 scanner/audit_scanner.py` command audits the packaged scanner's source integrity and synthetic regression fixtures; it does not scan a device, amend indicators, normalize original verdicts, or override a scan result.

## What was checked

On 2026-10-28, all **64 packaged source/data/notice files** matched their SHA-256 manifest and the reviewed Zero-Breach-Toolkit checkout at `fd39f351dfa0f611be8f7f8b3ac7f189a1f18ada`. The vendor folder is copied source inside Digital Lab, not a separate Git repository. Its parent repository's commit must not be confused with its upstream source pin. The checksum manifest detects differences relative to the pinned package; it is not independent publisher-signature verification. [1]

The repeatable audit passed **42 synthetic checks**. They exercise domain/IP boundary traps, exact and subdomain matches, caller lower-casing, text/byte agreement, UTF-16LE cases, parent-child deduplication, byte-order marks, corrupt/empty indicator refusal, unknown/partial coverage states, serious versus reference-only evidence, and heuristic leads that must not create findings. Only the integrity-checked matcher and result modules are imported. Fixture files are temporary and contain synthetic data; normal browser, host, phone, reader, update, and scan entry points are not invoked.

The linked original Zero Breach repository was separately reviewed at `1c7e9b6df81ea45982ec7d0f4fb607ffbbd55e00`. Its **28 existing matching/loader tests** passed using temporary synthetic fixtures. Those tests preserve its documented behavior; they do not establish real-world detection rates. The original module is not substituted for the currently packaged Toolkit. [2]

Five additional audit-safety regressions prove that integrity failure prevents imports, no device runner is called, an audit failure remains an audit result, reports cannot overwrite existing files, and audit output cannot be written into the scanner source tree. Together with six unchanged launcher regressions, all **11 scanner integration tests** passed.

## Compatibility findings kept separate from device findings

**The original and Toolkit have different machine-readable report contracts.** The reviewed original Zero Breach code rolls any recorded hit, including a cached reference, into `INDICATORS_FOUND` and exit 2, while its human report distinguishes reference-only evidence. The related Toolkit separates actionable findings from `REFERENCES_ONLY`. This is a compatibility warning for consumers—not a reason to rewrite the original output or label a cached reference as an infection. Original statuses and grades remain intact. [3] [4]

**Representation coverage is version-specific.** The original matcher searches lower-cased literal text and bytes, including UTF-16LE. The Toolkit adds decoded and canonicalized paths. The 42 audit checks cover the stated fixtures, not every escape, internationalized address, IPv6 representation, browser schema, optional pattern engine, or reader. Formats not exercised remain unvalidated by this audit. No additional decoding, classification rule, or suppression was injected into either scanner. [2] [5]

**Agreement is not independent corroboration.** Zero Breach Toolkit derives from Zero Breach and shares code, evidence conventions, and indicator lineage. Running related implementations does not independently confirm a finding or multiply its confidence. [1]

## How audit results are used

`--json audit-report.json` writes a new, separate audit file outside the scanner source tree. The file is not a `sharing-summary` device report and must not be fed into the device-summary workflow. Audit exit `0` means the included checks passed; `2` means a check failed; `1` means the audit could not complete. None is a device infection verdict.

Passing fixtures cannot eliminate false positives or false negatives, detect every unknown spyware family, recover deleted records, or certify safety. A failed fixture is a software-review task; a genuine device finding remains a separately authorized security-review task. The original live-device command still asks for explicit local consent and keeps its reports local.

## References

[1]: https://github.com/interplains/Zero-Breach-Toolkit/tree/fd39f351dfa0f611be8f7f8b3ac7f189a1f18ada "Zero Breach Toolkit pinned source and notices"
[2]: https://github.com/interplains/zero-breach/blob/1c7e9b6df81ea45982ec7d0f4fb607ffbbd55e00/scan/tests/test_matching.py "Original Zero Breach matching and loader fixtures"
[3]: https://github.com/interplains/zero-breach/blob/1c7e9b6df81ea45982ec7d0f4fb607ffbbd55e00/scan/adint_scan/report.py "Original machine and human report behavior"
[4]: https://github.com/interplains/Zero-Breach-Toolkit/blob/fd39f351dfa0f611be8f7f8b3ac7f189a1f18ada/scan/zbtriage/report.py "Toolkit separate findings and reference-only verdicts"
[5]: https://github.com/interplains/Zero-Breach-Toolkit/blob/fd39f351dfa0f611be8f7f8b3ac7f189a1f18ada/scan/zbtriage/iocs.py "Toolkit matcher implementation"
