# Compass Director + Agent

Compass now has two execution modes built with original Project Compass code. This release does not include HuthLab source code, brain-recording models, datasets, or neural decoding.

## Director + Agent

The server validates the structured assessment and policy grant. The **Compass Planning Agent** then runs the existing transparent recommendation engine exactly once. The **Compass Director** reviews that output and adds resource warnings, a risk register, proposed work packages, and a named human decision gate.

The Director checks required purpose authorization, recommendation traceability, quarterly scope, human accountability, the agent's narrowed capability grant, and the absence of external actions. It calls out undisclosed capacity, staffing gaps, non-project budget periods, close methodology rankings, and declared high-risk information where applicable.

This is rule-based orchestration—not an additional independent LLM, autonomous tool runner, verified auditor, or substitute for a decision owner. Optional AI narrative remains a separate, bounded feature and does not alter the selected methodology, policy grant, or Director checks.

## Agent only

The exact same planning agent can run independently. It returns the existing decision brief, methodology alternatives, traceable recommendations, execution plan, and separately authorized quarterly plan. It does not run the Director review. Both modes retain the same authorization, high-risk, replay, rate, size, and concurrency controls.

In the interface, select **Director + Agent** or **Agent only** at Review. The default is Director + Agent. The result and JSON export state which mode ran, the shared agent identity, run identifier, review stages, and pending human decision.

## API

All three routes use the same secured submission handler:

- `POST /api/director/recommend` selects Director + Agent on the server.
- `POST /api/agent/recommend` selects standalone Agent on the server.
- `POST /api/recommend` remains backward-compatible. It defaults to Director + Agent and accepts `executionMode: "agent"` for standalone operation.

The explicit routes do not let the payload override their execution mode. Unknown modes on the compatibility route are rejected. Each request still requires the binding cookie and one-time token from `GET /api/request-token`, a fresh `X-Request-Timestamp`, a unique `X-Idempotency-Key`, and the structured company assessment with its required authorization records.

Responses retain all previous decision-brief fields and add `orchestration` and `directorReview`. The latter is `null` for Agent only. Director statuses are **ready-for-human-review** or **needs-human-review**, never approval to execute.

## Permissions and accountability

Permissions are recomputed server-side. The planning agent receives only the required subset of the request's policy grant. Quarterly planning is included in that subset only with separate explicit consent. The fixed Director can call only the fixed planning agent; it cannot register arbitrary agents, execute commands, follow injected tool instructions, recurse, or delegate capabilities it does not possess.

Shell execution, credentials, deployment, arbitrary network access, model training, data retention, privilege escalation, cross-tenant access, and external actions remain unavailable. Work packages are proposed artifacts, not tasks automatically created in another system. The named human decision owner must validate and approve any real-world work outside this application.

Names, roles, and approval records collected in this stateless release are **submitter attestations**, not independently authenticated organizational entitlements. For confidential production deployments, place the application behind your organization's authenticated ingress and complete the required organizational security review. Publishing the source repository does not make the application suitable for unrestricted sensitive-data use or change its proprietary license.

## Run it yourself

```bash
npm ci
AI_MODE=off npm start
```

Open `http://localhost:8787`. For production, use HTTPS, inject any provider credentials server-side, and apply authenticated ingress appropriate for the organization. AI is off by default and is not required for either orchestration mode.

```bash
npm run verify
```

The staged private worker also uses `runCompass`, so it shares the same agent, policy checks, and mode handling. No new hosting service, paid worker, model provider, or credential is required for this addition.

## Implementation

`src/planning-agent.js` owns the shared agent and narrowed grant. `src/director.js` owns fixed orchestration and deterministic review. `src/server.js` enforces the common gateway. `worker/index.js` uses the same orchestration entry point. The browser renders proposed work and review findings without treating them as executable instructions.
