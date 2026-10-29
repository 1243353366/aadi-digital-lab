# Integration security fixes and demonstration

This is a source-only security-branch change to Digital Lab, not a FreeLLMAPI server release or a live penetration test. The upstream server, dashboard, custom-provider dispatcher, credential export/import, backup implementation and Electron application are not imported. The attached source-review leads are not labeled confirmed upstream exploits.

## Evidence → interpretation → recommendation → action → owner → dependency → success criterion

**Evidence:** Digital Lab's website had `express.json({ limit: "50mb" })` ahead of tRPC authentication. The first version of the new adapter also contained a `response.text()` fallback whose size was checked only after reading. Both are directly inspectable source behaviors in the affected integration.

**Interpretation:** Large pre-authentication JSON bodies or a fallback provider response can allocate excessive memory before the relevant check. These are resource-boundary defects; they do not by themselves establish remote code execution, stolen keys, a crash or a self-propagating attack.

**Recommendation:** Perform cheap admission/role checks before JSON parsing, limit active API requests, and require streaming provider responses with an actual byte budget.

**Action:** Place the website's ingress middleware before all JSON parsers; reduce JSON/form ceilings to 64 KiB/16 KiB and refuse compression; require a real administrator principal before parsing company mutation bodies. Enforce bounded admission bookkeeping/concurrency. Remove the adapter's unbounded fallback so it refuses a non-streaming response without calling `text()` or `json()`; preserve a 64 KiB streaming cap and a 10-second deadline. Recognized upstream errors are reconstructed with generic messages rather than returned raw.

**Owner:** The application's deployment operator owns hosting, approved origin, reverse-proxy configuration and resource limits. The named company decision owner remains accountable for using the advisory output. Upstream authors are credited, not assigned responsibility for these downstream changes or represented as endorsing them.

**Dependency:** Existing authenticated context, a shared database for durable job quotas/replay, the reviewed local source manifest, and an operator-approved keyless local model endpoint. A native authenticated FreeLLMAPI installation is not made keyless by bypassing its protections; it safely remains unavailable to this adapter.

**Success criterion:** Mocked tests prove unauthorized requests are refused before parser/model execution, valid administrator requests still work, oversized/compressed requests and unbounded provider readers are refused, rate/concurrency/state ceilings hold, and model responses cannot expand the agent's tool permissions. Website type checking and production build must pass. No real company data, provider account, device scan or deployment is used in these tests.

## Network and trust limits

Direct website binding defaults to `127.0.0.1`; exposure requires explicit `HOST` configuration. Host allowlisting defaults to loopback names and adds only the hostname from trusted `PUBLIC_ORIGIN`. Incoming origin validation does not accept caller-controlled forwarded Host as authority. The adapter permits only numeric loopback HTTP `/v1` URLs, with no URL credentials, query or fragment; it refuses remote/custom/DNS destinations and redirects. It therefore does not import the upstream custom-provider DNS check/use gap.

A loopback gateway can itself forward externally, log prompts or retain responses. The operator must review it and its full downstream pool. Operating-system network isolation and trusted proxy/edge limits are separate controls. In-process ingress/concurrency does not certify distributed botnet resistance, native-platform equivalence or the whole upstream application. Source hashes establish consistency relative to an approved Git artifact, not independent publisher authenticity if code and manifest are replaced together.

## Reproduce

From the repository root:

```bash
node integrations/freellmapi/verify.mjs
node --test integrations/freellmapi/adapter.test.mjs
cd website
pnpm check
pnpm test
pnpm build
```

Adapter tests use in-memory responses. Ingress tests use disposable loopback HTTP fixtures, not an external target or device scan. The original rule-based Director/Agent and scanner functionality remain separate; optional narrative errors leave the original brief intact. The job layer is disabled by default and contains zero API-key configuration or credential storage.

## Attribution

FreeLLMAPI API/headless design: Tashfeen Ahmed ([@tashfeenahmed](https://github.com/tashfeenahmed)), upstream MIT license retained. Original Compass integration and fixes: requested by [@1243353366](https://github.com/1243353366), developed with Manus AI assistance. Existing scanner/research/software credits remain in the root README. Account links are attribution, not unsolicited notifications or an endorsement.
