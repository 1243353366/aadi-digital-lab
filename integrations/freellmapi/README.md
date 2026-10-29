# Keyless complementary job layer

This optional integration preserves the OpenAI-compatible job shape of [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi), reviewed at commit `4f8a95040f5921d9eee9db8e50a343fd9ec4d93d`, without copying its dashboard, credential store, installer, or provider-key management. It is an original, bounded adapter—not the whole upstream router or a claim that upstream services work without credentials.

**There are no seven key slots, provider credentials, bearer headers, or API-key files in this Compass layer.** The updated user request is keyless. Company API endpoints still require the application's existing authenticated administrator role, consent, origin checks, fresh one-time token, and idempotency key. “Keyless model adapter” does not mean anonymous access to company data.

## Job flow

Authorized assessment → server-side Director/Agent baseline → separate external-purpose consent → database-backed quota → one bounded keyless local completion → untrusted optional explanation → human review.

The core methodology, evidence chains, plans, scanner, and safeguards are not replaced. The optional model cannot grant capabilities, execute actions, call tools, trigger deployment, or revise original scanner verdicts. Only the selected method and generic catalog tradeoffs leave the server; raw intake, objectives, company/person names, emails, budgets, goals and scan reports are excluded. High-risk assessments are refused for this path. The original decision brief remains usable if the job is disabled, limited, unavailable or rejected.

No prompt/answer cache or durable background worker is introduced. Job/request identifiers are hashed for bounded replay checks; no prompt or credential is hashed and published. Requests are processed within their current server request, not scheduled for later execution. The job skeleton remains ready for an operator-approved local OpenAI-compatible endpoint.

## Optional local endpoint

Defaults are disabled. Hosting is deliberately left to the user. Configure only these non-secret server settings if the optional endpoint is wanted:

- `FREELLMAPI_ENABLED=1`: explicitly enable the optional adapter.
- `FREELLMAPI_URL=http://127.0.0.1:3001/v1`: numeric loopback endpoint only, with no URL credentials, query or fragment. Remote URLs and redirects are refused.
- `FREELLMAPI_MODEL`: the operator-selected text model; fusion/tool/media workflows are not part of this adapter.
- `FREELLMAPI_COMPANY_USE_APPROVED=1`: the operator has reviewed the local service, complete downstream provider pool and applicable data terms.

There are **no secret variables to request or populate for this layer**. The optional server sends no `Authorization` header. Native FreeLLMAPI usually requires a unified bearer token and provider configuration; this skeleton will not bypass that authentication. An authenticated-only endpoint returns a safe unavailable job. Use a genuinely keyless local model endpoint, or leave the skeleton disabled. Never remove production authentication from upstream just to make this adapter succeed. A local gateway may make its own external requests; the operator must review that service's routing, logging, caching, retention and provider terms separately.

Upstream's README describes personal experimentation, not a supported production inference substrate. Its license is MIT, but provider terms and free-tier limitations still apply. No unlimited quota, free model access, third-party non-retention or upstream endorsement is promised.

## Tighter resource controls

The website enforces database-backed limits of **2 jobs/minute per account, 10 jobs/hour per account, and 10 jobs/hour across the whole pool**, using the same database for all replicas. This is intentionally stricter than multiplying a quota by credential/provider count. The adapter adds in-process quotas, one concurrent operation, bounded replay bookkeeping, a 10-second request/body deadline, an 8 KiB prompt ceiling, a 64 KiB response ceiling and at most 512 requested output tokens. There are no automatic retry chains or fallback requests after a 429. Upstream internal routing must still be controlled by its operator.

In-process concurrency/replay state is not a durable multi-replica supervisor and resets at restart. Database-backed website limits/replay checks remain the shared boundary; replicas need the same database. Other direct adapter consumers must provide their own equivalent identity, durable quota and replay enforcement. A request/runtime timeout cannot certify a downstream service's internal resource behavior.

## Integrity and tests

`source-manifest.json` records upstream provenance plus SHA-256 hashes of the local integration files; `verify.mjs` checks them without calling a model. This detects changed bytes relative to the reviewed artifact. It is not publisher signature verification and cannot protect a distribution whose code and manifest are both replaced. Obtain an approved Git commit through a trusted channel.

```bash
node integrations/freellmapi/verify.mjs
node --test integrations/freellmapi/adapter.test.mjs
```

Website consent/role/quotas and minimized-payload regression tests live under `website/server/`. All tests use mock responses; no real model, API credential, paid account, device scan or hosting deployment is used.

## Credit

FreeLLMAPI: **Tashfeen Ahmed ([tashfeenahmed](https://github.com/tashfeenahmed))**, MIT copyright 2026. The original license is retained as `LICENSE`; upstream contribution history remains at [contributors](https://github.com/tashfeenahmed/freellmapi/graphs/contributors). This adapter and integration were requested by [1243353366](https://github.com/1243353366), developed with Manus AI assistance, and preserve existing component credits in the root README. Attribution does not imply endorsement.

Sources reviewed: [upstream README](https://github.com/tashfeenahmed/freellmapi/tree/4f8a95040f5921d9eee9db8e50a343fd9ec4d93d), [headless/declarative installation](https://github.com/tashfeenahmed/freellmapi/blob/4f8a95040f5921d9eee9db8e50a343fd9ec4d93d/docs/en/install/01-install.md), and [upstream MIT license](https://github.com/tashfeenahmed/freellmapi/blob/4f8a95040f5921d9eee9db8e50a343fd9ec4d93d/LICENSE).
