# Compass — Planning Studio

A responsive website for objective-led project planning, with Director + Agent and Agent-only modes, the shared Corpora backbone, explicit purpose authorization, seven-field recommendation traceability, delivery plans, a framework library, and a consent-gated local security scanner workflow.

This website is a standalone sibling of Digital Lab's existing `fullstack/` app. Adding its source does not replace the blog, research APIs, or the earlier Compass integration. No Render or other hosting deployment is performed by this source update.

Keep sibling `../integrations/freellmapi/` when building from a checkout; the adapter is bundled into the Node server. The [optional keyless job skeleton](../integrations/freellmapi/README.md) is disabled by default and needs no API-key setup. An authenticated-only gateway remains unavailable rather than receiving a fabricated key or having authentication bypassed.

## Develop and verify

From this directory, use Node 22 and the pinned package manager:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm dev
```

The source uses React, tRPC, Drizzle/MySQL, and Manus OAuth. The public sample and framework library use synthetic/reference data only. Real company assessments, token issuance, and security-summary review require an authenticated **administrator**; ordinary members and anonymous callers are rejected server-side.

For an independent deployment, configure the runtime rather than committing values: `DATABASE_URL`, `JWT_SECRET`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `OWNER_OPEN_ID`, and `OWNER_NAME`. The existing OAuth callback is `/api/oauth/callback`; register the correct origin with the authentication provider. Generated SQL in `drizzle/` includes the user table and short-lived guard/rate metadata. Review and apply migrations before use. Do not invent a seeded administrator password or bypass role checks to make a demo work.

## Routes

`/` is the overview. `/assess` is the authorized intake. `/brief` displays either the current session's result or a synthetic sample. `/frameworks` is searchable. `/safety` describes the permission boundary. `/system` describes shared coordination and provenance. `/scanner` provides the local scan command and separately authorized aggregate-summary review.

## Corpora backbone

The current [corpora-ai](https://github.com/1243353366/corpora-ai) Compass engine is vendored server-side from base commit `9c92e79df7f4d53371c8b62c7b340c4c3a9bdbc2`. Director/Agent extensions originate in Digital Lab commit `9b893da72826115fa187e6bdaf5979262540f57e`; the website adds a request-scoped signal trail and reusable Director traceability validation. Both business-planning modes invoke the identical planning agent once.

The baseline components are transparent, rule-based software—not neural decoding or autonomous shell agents. Normal planning sends no company information to GitHub, public research endpoints, external LLMs, or training pipelines. A separate disabled-by-default job can send only the selected method and generic tradeoffs to an operator-approved keyless local endpoint after additional external-purpose consent. Raw intake, identities, budgets, objectives and scan reports are excluded; high-risk assessments are blocked. Its untrusted narrative does not change the core recommendation or grant agent authority. Permission is recomputed outside reasoning. Shell, credential access, arbitrary network, deployment, training, cross-tenant access and privilege escalation remain unavailable agent capabilities. A local gateway may contact its own downstream providers; their retention/training terms must be reviewed separately.

Direct Node startup now binds `127.0.0.1` by default. If hosting behind a trusted proxy/container, explicitly configure `HOST` for the intended network interface and `PUBLIC_ORIGIN` for the site's exact public origin; incoming Host/origin validation does not trust caller-supplied forwarded headers. API admission limits and role checks run before JSON parsing; JSON is capped at 64 KiB and URL-encoded forms at 16 KiB, with compression refused. Ingress uses connection-peer IP, hard-bounded counters and limited active API requests. Behind a proxy, callers may share its quota; a trusted edge should add independent per-client controls. These in-process ingress controls are not a distributed WAF or an upstream-provider audit.

## Local scanner

From the **repository root**, a person runs:

```bash
python3 scanner/compass_scan.py
```

This starts a real standard scan on the person's current live computer **after explicit terminal consent**. The person does not need to send the application owner device details. Network-offline scanning is not the same as scanning an offline device. The full evidence report remains local. See [`../scanner/README.md`](../scanner/README.md) for Windows, optional existing phone backups, privacy limits, and the pinned Zero-Breach-Toolkit version.

The website accepts only the minimal `sharing-summary.json` type. It reads the selected file locally, discards untrusted extra fields, and submits only known status and aggregate counts after a separate security-purpose grant and administrator check. The Agent's bounded security-summary module generates a seven-field recommendation; the shared Director validator checks its traceability. Neither gets device execution permissions, raw evidence, instructions, or model-training authorization.

## Data and human responsibility

No company assessment or generated plan is stored as a project. Inputs/results exist in the active request and open browser session; session data is cleared on sign-out/user change. Account records and expiring hashed token/rate metadata are stored separately. Exported briefs and local scanner files remain the user's responsibility.

Submitter authority and a named human decision owner are required. Quarterly planning has a separate scope. High-risk information needs declared categories, named approver authority, separate processing permission, and informed-risk acceptance; that is an attestation, not independent entitlement verification or a legal waiver. Recommendations are advisory, and no external action is performed.

## Licenses

The original website shell/UI and existing lab remain under the repository's MIT terms. The vendored planning core retains its separate proprietary internal-use license at `server/compass/LICENSE`. Zero-Breach-Toolkit and indicator/research-rule notices are preserved in `../scanner/vendor/zero-breach/`. Public source visibility does not relicense separately licensed components.
