# SAFE Local Misuse Safeguards: Boundaries and Limitations

## Purpose

This document defines the safety boundaries for the local Compass scanner safeguard wrapper. Its purpose is to reduce accidental or policy-disallowed local misuse through narrow, user-visible restrictions. It is a local operational control, not a security authority, forensic system, or intent detector.

## What the safeguard may do

When the local wrapper is used, it may only apply the following kinds of restrictions:

- Reject URL/UNC/device-path targets, redirected paths, missing backups, and Windows drives identified as remote or unclassifiable.
- Require a backup collection directory with a regular `packages.json` (AndroidQF) or `Manifest.plist` (iPhone) entry marker and recheck its root identity after consent, without claiming a frozen evidence tree.
- Impose a default 1800-second runtime and a user-selected range of 1–3600 seconds with `--max-runtime-seconds`.
- Use an OS handle advisory lock for one wrapper per account/temp-root slot; the lock releases on wrapper exit, without deleting state.
- Honor the operational kill switch `COMPASS_SCANNER_DISABLED=1` at entry.
- Write limited, local-only partial audit information about the wrapper's own operation.
- Cancel only a scanner child process that the wrapper itself started and owns.

These restrictions are intentionally local and narrow. They do not broaden what the scanner may access, discover, collect, or transmit.

## Explicit non-goals

The safeguard must not be used to perform or enable any of the following:

- Arbitrary host scans, host-wide enumeration, or reconnaissance.
- Remote scanning, network discovery, telemetry, or exfiltration.
- Permanent bans, retaliatory actions, or punitive enforcement.
- Classification of a person or activity as malicious.
- Fraud detection, fraud adjudication, or proof of wrongdoing.
- Expansion of consent, collection, retention, or data-processing authority.

The safeguard does **not** grant permission. A policy event, rejection, timeout, audit entry, or lock event may restrict an invocation only; it never authorizes an invocation, proves fraud, proves malicious intent, or establishes misconduct.

## Scope and path trust boundary

Without `--backup`, the existing fixed computer check is retained. With `--backup`, only an existing collection directory is eligible; links, reparse points, URLs and UNC/device forms are refused before launching. Only marker/path metadata is checked before consent; collection contents are left to the original reader after consent. Markers are format hints, not authentication. Root identity is checked again after consent. This does **not** establish that every POSIX mount is local, rule out bind/network mounts, freeze descendants, or protect against concurrent same-identity changes. Use operating-system mount restrictions/isolation for strict local-only evidence access. Native Windows/macOS behavior is not certified by Linux fixtures.

A path passing a local validation check is not evidence that its contents are benign, that the user has a legal right to scan it, or that a scan is appropriate. Separate consent and authorization requirements remain unchanged.

## Timeouts and cancellation

Timeouts are a containment measure, not a transactional guarantee. When a wrapper-controlled timeout occurs, the wrapper may cancel only the scanner child it created and owns. It must not terminate unrelated processes or attempt system-wide cleanup.

`COMPASS_SCANNER_DISABLED=1` refuses a **new** scan at entry and immediately before launch; changing that environment variable does not remotely stop an already-running process. Use Ctrl+C for the current invocation. A terminal-generated Ctrl+C can also reach pipeline peers in the same foreground group; the wrapper does not send a system-wide kill. The wrapper is not a durable supervisor: forcibly killing it can release its advisory slot before its child exits. The runtime bound does not cover time spent waiting for human consent. Locking is per temp root and account, not a machine-wide or account-service quota.

Cancellation may leave scanner-created or pre-existing data in place. A cancellation does not guarantee rollback, deletion, restoration, or recovery of data. Users remain responsible for understanding and managing retained data according to their applicable policy and authorization.

Timeout/cancellation returns exit 3 and a local `guard-events.json` record stating incomplete coverage. It does not rewrite original scanner findings. Review that record before treating any partially written report as complete or sharing a summary; a stopped operation is not evidence that the target is safe or malicious.

## Local-control limitation

The user controls the device and may modify, replace, bypass, or remove the launcher and local safeguard. A local tool cannot reliably determine a person's real intent, distinguish all benign from harmful uses, or prevent someone from invoking another executable directly.

In particular, invoking the original scanner CLI directly, outside the wrapper, is not covered by these wrapper safeguards. The wrapper does not claim to monitor, intercept, or govern direct CLI use.

## Audit and privacy boundary

Any partial audit record is local-only and limited to the wrapper's operational events. It is not telemetry, remote reporting, a behavioral profile, evidence of wrongdoing, or a substitute for an investigation. Local audit data must not be represented as proof of fraud, malice, intent, or policy violation.

## Consent remains unchanged

This safeguard does not alter, replace, obtain, or infer consent. It does not expand the scanner's permitted scope. Users and operators must continue to apply all existing authorization, consent, retention, and data-handling requirements before using the scanner.

## Attribution

The underlying project remains credited to its original authors. This safeguard documentation and any associated local controls include Manus-original contributions where applicable. Attribution is not endorsement: neither the original authors nor Manus is represented as endorsing any particular use, user, target, or outcome.
