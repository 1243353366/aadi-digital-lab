# Compass in Aadi's Digital Lab

The merge adds original Compass Director + Agent planning alongside the existing lab. The blog, admin dashboard, Corpora proxy, and evidence-grounded reasoning APIs remain in place. Their source and history have not been replaced.

## Entry points

The lab serves the Compass interface at `/compass/`. Its home navigation includes a Compass link. The separate `compass/` directory is also a complete Node application: `npm ci --prefix compass && npm run start:compass` runs it on its own host.

In the merged Worker, planning uses `/api/compass/director/recommend` or `/api/compass/agent/recommend`. Both run the identical Compass Planning Agent. The Director adds deterministic scope/traceability checks, resource warnings, a proposed risk register, work packages, and a named human decision gate. Neither mode performs external actions. This is original software; HuthLab code, fMRI recordings, checkpoints, datasets, and neural decoding are not included.

## Authenticated gateway

The public interface can be viewed, but token issuance and planning requests require the lab's existing **authenticated admin session**. An anonymous request is rejected with `401`; a non-admin session is rejected with `403`. The body still needs the separately required company-use authorization, attributable submitter and decision owner, and any conditional high-risk approver record. These form records do not replace session authentication or independent organizational permission.

One-time request tokens are hashed, bound to the authenticated user, expire after ten minutes, and are consumed atomically in D1. Idempotency state is shared across both modes. Requests also have origin checks, fresh timestamps, body limits, and account/IP rate controls. D1 stores only short-lived token/idempotency metadata and ordinary gateway rate records—not company assessments, recommendations, or training records. No new business-content table is introduced.

The gateway creates its small token/idempotency tables with `CREATE TABLE IF NOT EXISTS` when needed; it does not modify existing blog tables. Existing sessions and user tables must already be present from the lab schema. Do not publicly deploy with an unchanged seed administrator password. Use the existing account/password controls and complete organizational review before accepting sensitive company data.

## Evidence and AI separation

The merged Compass gateway uses transparent planning only. It does not invoke Workers AI, the Corpora proxy, the research agent, or the reasoning-log pipeline. Company information is not automatically sent to research endpoints, stored in public backups, or reused for training. Linking the research and planning systems later would require a separately reviewed, purpose-authorized evidence contract.

The standalone Compass Node application retains its optional provider-configured narrative layer, disabled by default. That is separate from Director coordination and is not enabled by this merge.

## Build and hosting

```bash
npm ci --prefix compass
npm run verify
npm run sync:compass
cd fullstack
npx wrangler@4 deploy --dry-run
```

The existing GitHub deployment workflow still targets the lab Worker. A successful live deploy requires valid repository secrets named `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, with the appropriate account permissions. This merge does not create credentials, change accounts, provision paid services, or modify Render hosting. A GitHub push is not proof of a successful live deployment; check the Actions result and `/api/compass/health` afterward.

For local Worker smoke tests, use `fullstack/wrangler.smoke.toml`. It omits the remote AI binding so tests do not require production credentials. `scripts/sync-compass.mjs` copies the source frontend into lab assets with the correct API prefix, sign-in notice, and license. CI verifies that copied assets match their source.

## License boundary

The lab's existing files remain under its MIT license. The imported Compass application and copied Compass frontend retain `compass/LICENSE`, also copied into `fullstack/public/compass/LICENSE`. Public source visibility does not convert that component into unrestricted MIT-licensed software.

For the detailed Director/Agent model and standalone API contract, see [the Compass guide](compass/DIRECTOR-AGENT.md).
