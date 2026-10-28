# Aadi's Digital Lab

> Research, OSINT, AI, and Systems Thinking.

A production-ready blog + research dashboard. One self-contained Cloudflare
Worker serves the static frontend and the API, with a D1 (SQLite) database,
admin dashboard, and GitHub-powered console telemetry. Zero build step, zero
npm dependencies.

**Live:** https://aadi-digital-lab-fullstack.aadishankar1999.workers.dev

## Planning Studio website and local scanner

The new responsive website is in [`website/`](website/README.md), alongside the existing app—not replacing it. It includes both planning modes, the shared Corpora backbone, a guided authorization flow, actual evidence-to-action briefs, delivery plans, a searchable framework library, and a separate scanner workflow. No hosting deployment is part of this source update.

After downloading this repository, a person can start a real scan on their **current live computer** with:

```bash
python3 scanner/compass_scan.py
```

The command starts the read-only scan after explicit consent in the terminal, then runs unattended. It does not automatically upload evidence or grant an AI agent device-control permissions. Only a reviewed minimal sharing summary can be separately authorized for the website's bounded Agent/Director review. See [scanner setup and privacy](scanner/README.md).

To audit the scanner itself, without scanning a device or changing its original results:

```bash
python3 scanner/audit_scanner.py
```

This separate audit checks the pinned source and 42 synthetic matcher, evidence, and coverage regressions. Audit warnings are not device findings and do not override the original scanner's verdicts. Passing the audit does not eliminate false positives or false negatives. See [scanner audit findings](scanner/AUDIT.md).

## Compass Director + Agent

The repository now includes Project Compass in `compass/`, mounted in the lab at `/compass/`. Director mode coordinates the same planning agent, checks traceability and purpose scope, and proposes work packages, resource warnings, and a risk register. Agent-only mode runs that same agent independently. These are original, transparent planning components—not an fMRI decoder or autonomous execution tools.

The lab's `/api/compass/*` planning endpoints require an authenticated **admin session** in addition to company-purpose authorization, conditional high-risk approval, one-time tokens, replay/idempotency protection, and account/IP rate limits. Company assessments are not sent to the public Corpora/reasoning tools or saved in the blog database. See [Compass integration](COMPASS-INTEGRATION.md) for hosting and security details.

Existing lab code remains MIT-licensed. `compass/` and its copied frontend under `fullstack/public/compass/` retain the separate proprietary internal-use license in `compass/LICENSE`; the merge does not relicense those files as MIT.

## Structure

The original lab application lives in `fullstack/`, with the standalone Compass module in `compass/`:

- `public/` - static site (pure HTML/CSS/JS, dark-mode-first)
- `src/index.js` - Worker entry: routes every `/api/*` request
- `api/` - backend modules (posts, comments, likes, auth, admin CRUD)
- `schema.sql` - D1 schema + seed content
- `deploy.sh` - one-shot deploy (schema apply + Worker deploy + verify)
- `backup.sh` / `restore.sh` - off-site D1 backup to this repo (versioned
  history = rollback / ransomware recovery). `restore.sh --remote` is
  destructive (replaces production content).

From the repository root, `npm ci --prefix compass && npm run verify` runs the Compass and gateway tests. `npm run sync:compass` regenerates the mounted Compass frontend. `npm run start:compass` runs the standalone Node application for a separate host.

## Security

Strict CSP (no inline JS), security headers on all responses, D1-backed rate
limits (login 8 / comments 5 / likes 30 per 15 min per IP), 32KB API body cap,
PBKDF2 auth with server-side sessions, audit log of admin mutations, stored
XSS escaped everywhere.

## CI

GitHub Actions boots the whole app in a sandbox on every push: seeds a local
D1, serves the Worker with `wrangler dev`, and smoke-tests search, tags,
comments, likes, the auth gate, and security headers.

## Deploy

```bash
cd fullstack && ./deploy.sh
```

## Authors and attribution

**Aadi’s Digital Lab:** Copyright © 2026 **Aadi Shankar**, as recorded in the root [MIT license](LICENSE). The public repository contributor account is [@1243353366](https://github.com/1243353366). Original Corpora/Compass work is credited to the [Corpora AI project / @1243353366](https://github.com/1243353366/corpora-ai); its included copyright is © 2026 1243353366 and its [separate internal-use license](compass/LICENSE) remains in force. The Compass/Director, website, and audit additions were developed with **Manus AI assistance**; that does not change ownership or component licenses.

**Scanner authors:** [ArchiveGenocide / archivegenocide.com (@interplains)](https://github.com/interplains) is credited by the upstream NOTICE files for both [Zero Breach](https://github.com/interplains/zero-breach) and [Zero Breach Toolkit](https://github.com/interplains/Zero-Breach-Toolkit), built by the same authors. Verified public contributors additionally include [@NurAbir](https://github.com/NurAbir) for Zero Breach and **[Luke Hutchison (@lukehutch)](https://github.com/lukehutch)** for Zero Breach Toolkit. The [Zero Breach contributor record](https://github.com/interplains/zero-breach/graphs/contributors) and [Toolkit contributor record](https://github.com/interplains/Zero-Breach-Toolkit/graphs/contributors) retain the current upstream contribution histories. These project credits do not imply that every contributor authored every file.

**Indicator and research sources:** Credit goes to **The Citizen Lab**, **Recorded Future / Insikt Group**, **Confiant**, **Microsoft**, **ESET**, **Avast / Gen**, **Google Threat Analysis Group**, and **Amnesty International Security Lab**, as documented in the retained [indicator bibliography and CC0 notice](scanner/vendor/zero-breach/iocs/LICENSE.md). External optional feeds additionally credit the **Mobile Verification Toolkit (MVT) project** and **Echap**; these are source acknowledgments, not software authorship or claims that those external feeds are bundled or automatically downloaded.

**Third-party detection-rule authors:** The retained optional Candiru rule material credits **Microsoft Threat Intelligence Center (MSTIC)** for `MAL_DevilsTongue_HijackDll` and **Felix Bilstein** for `win_devilstongue_auto`. Their Detection Rule License 1.1 and CC BY-SA 4.0 materials remain under [third_party/candiru](scanner/vendor/zero-breach/third_party/candiru/). These optional rules are not enabled by the standard Compass launcher.

The original [scanner NOTICE](scanner/vendor/zero-breach/NOTICE), Apache-2.0 license, data notices, and rule licenses are preserved. Application dependencies retain their own upstream authors and licenses. **HuthLab is referenced, not incorporated**: no HuthLab code, brain recordings, datasets, models, or neural-decoding implementation is included. Credits imply neither affiliation nor endorsement and grant no device access, training permission, or broader license rights.
