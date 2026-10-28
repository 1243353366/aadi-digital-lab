# Downstream security changelog

## 2026-10-28 — Owned cleanup and changing-machine-state hardening

This patch is based on Zero Breach Toolkit upstream commit `fd39f351dfa0f611be8f7f8b3ac7f189a1f18ada`. Upstream authorship, indicator attribution, licenses, and historical changelog remain intact. This is a security patch to the read-only forensic tool, not a new remediation or rollback product.

### Authority boundary

The reviewed `scan_recovery` context preserves completed evidence on interruption and clears the backup password. It is **not** a system rollback facility. This patch adds no ability to restore arbitrary paths, modify original evidence, change system permissions, remove malware, or act on instructions embedded in a report or database.

- Stale-folder discovery no longer recursively deletes folders because of a matching name, user ownership, or age. Those observations are not proof of tool creation or inactivity. Candidates are retained and reported for informed human review.
- Current-process browser and iOS copy cleanup uses in-memory ownership records. There is no on-disk manifest that can grant authority. Recorded directory/file identities, private permissions, no-follow checks, and handle-relative operations bound cleanup to copies created by this invocation.
- Cleanup is non-recursive. Unknown children, substituted roots, changed file identities, links, unsupported handle-relative operations, and removal failures cause retention and an explicit warning/gap, not permission changes or broader deletion.
- Acquisition failure retains partial analysis and acquisition records instead of recursively trusting a path from failure state.

### Machine-state boundary

- Hardened browser copying checks opened source identities, enforces the byte budget while reading, uses exclusive private destinations, and rejects changing sources instead of treating an incomplete view as complete coverage.
- Source snapshot consistency checks do not freeze a running browser or prove a cross-file transaction is atomic. Changed database/sidecar state must be surfaced as incomplete coverage.
- SQLite connections use `mode=ro` at open time, not just `PRAGMA query_only` afterward. A vanished copy cannot silently become a new empty database. Existing schema, memory, column, and expression guards remain.
- WAL validation, missing-sidecar gaps, partial results, and cleanup-failure disclosures are preserved. No detection indicators or evidence-grade meanings are reclassified by this patch.

### Operational limits

This is not an OS sandbox. A compromised kernel, administrator, or hostile process with the scanner's own identity can defeat application-level assumptions. POSIX network mounts may look local. Strict offline/hostile-machine forensics requires trusted acquisition and OS-level isolation. On platforms lacking the required handle-relative primitives, the hardened copy path fails closed and/or retains private copies with a reported gap rather than claiming equivalent protection. Native Windows hardening is not certified by the Linux fixture run. Retention is not secure erasure.

The patch must not be described as eliminating every race, detecting all spyware, or proving the machine safe. Detection behavior on stable supported fixtures is retained; unsafe/unvalidated states produce explicit gaps or failures.

### Credits

Original scanner authors: ArchiveGenocide / archivegenocide.com ([interplains](https://github.com/interplains)), plus upstream contributor Luke Hutchison ([lukehutch](https://github.com/lukehutch)); original Zero Breach contributors include [NurAbir](https://github.com/NurAbir). Downstream changes requested and maintained by [1243353366](https://github.com/1243353366), with implementation and tests developed with Manus AI assistance. Research publishers and optional rule authors remain credited in the README and original NOTICE. These are attribution links, not requests for upstream review or claims of endorsement.

### Indicator-source approval and updater resource limits

The paired digest downloaded with an indicator list is not independent publisher authentication. The patched Toolkit updater and cached-feed loader require the canonical source descriptor, source commit, and byte digest approved in the trusted application release. Mutable cache metadata, `--latest`, arbitrary descriptors, and `--accept-shrink` cannot promote unapproved content. New approvals require a reviewed application-release change; neither a self-supplied digest nor successful parsing is an approval.

The Toolkit already bounded its `resp.read(MAX_DOWNLOAD + 1)` before this patch. It now streams in at most 64 KiB chunks within that same total budget and rejects invalid/oversized declared lengths and unsupported response encoding before reading the body. Actual response bytes, not Content-Length alone, enforce the cap; the existing network timeout is retained. Synthetic tests cover absent/lying headers, oversized streams, exact limits, closure on failure, and valid responses.

The original Zero Breach updater (a different code path at original commit `1c7e9b6df81ea45982ec7d0f4fb607ffbbd55e00`) did have an unbounded `resp.read()` with a 30-second timeout. A separate, tested `original-updater-bounded-read.patch` is included in Digital Lab's `scanner/patches/`, not silently substituted for the bundled Toolkit updater. It adds explicit data/checksum response limits. The ordinary Compass device command still performs no downloads and uses no downloaded feed cache.

These are indicator-poisoning and updater resource-exhaustion controls. They do not demonstrate arbitrary code execution, a remotely exploitable scanner defect, active host discovery, or self-propagation. Trusted distribution compromise or semantically incorrect approved indicators remain outside the guarantees.
