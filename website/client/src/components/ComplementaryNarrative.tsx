import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePlanning } from "@/contexts/PlanningContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";

export function ComplementaryNarrative() {
  const { user } = useAuth();
  const { assessment, mode, result } = usePlanning();
  const [authorized, setAuthorized] = useState(false);
  const [narrative, setNarrative] = useState<any>(null);
  const [error, setError] = useState("");
  const info = trpc.compass.complementaryInfo.useQuery(undefined, { enabled: user?.role === "admin", retry: false });
  const token = trpc.compass.requestToken.useMutation();
  const request = trpc.compass.complementary.useMutation();
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { setAuthorized(false); setNarrative(null); setError(""); }, [result, mode, user?.id]);
  const available = info.data?.enabled && info.data?.companyUseApproved;
  async function generate() {
    if (!authorized || !available || submitting) return;
    setSubmitting(true); setError(""); setNarrative(null);
    try {
      const grant = await token.mutateAsync();
      const answer = await request.mutateAsync({ assessment, executionMode: mode, externalProcessingAuthorized: true, externalConsentVersion: "compass-complementary-external-v1", token: grant.token, timestamp: Date.now(), idempotencyKey: crypto.randomUUID().replaceAll("-", "") });
      setNarrative(answer);
    } catch (failure: any) { setError(failure.message || "Optional explanation unavailable. Your original brief is unchanged."); }
    finally { setSubmitting(false); }
  }
  return <section className="content-card" style={{ marginTop: 24 }}>
    <h3>Optional complementary explanation</h3>
    <p>The original Agent/Director brief remains the decision-support baseline. This separate FreeLLMAPI layer can explain its general methodology and tradeoffs; it cannot execute actions or grant permissions.</p>
    {!available ? <p className="form-note"><ShieldCheck size={18}/> Disabled until an authorized operator configures and approves the gateway. The optional job layer is keyless: no API-key slots, credential storage or bearer headers.</p> : <>
      <label className="flex gap-3" style={{ marginTop: 16, alignItems: "flex-start" }}><input type="checkbox" checked={authorized} disabled={submitting} onChange={e => setAuthorized(e.target.checked)}/><span>I explicitly authorize sending the suggested method and its generic tradeoffs to the operator-approved keyless local endpoint and any downstream providers it uses for an optional planning explanation. Raw intake, names, emails, budgets and scan reports are excluded. I have reviewed those providers’ retention/training terms; this does not authorize training by Compass or unrelated processing.</span></label>
      <p>Consent version: compass-complementary-external-v1. Provider terms still apply; Compass cannot guarantee third-party deletion, retention or training practices. High-risk assessments are blocked from this layer.</p>
      <Button disabled={!authorized || submitting} onClick={generate}>{submitting && <Loader2 size={15} className="animate-spin"/>} Generate optional explanation</Button>
    </>}
    {error && <p role="alert">{error}</p>}
    {narrative && <div role="status" style={{ marginTop: 16 }}><strong>Optional explanation · {narrative.suggestedMethod}</strong><p style={{ whiteSpace: "pre-wrap" }}>{narrative.text}</p><p>{narrative.warning || "Untrusted model narrative. Human review required; not new evidence or an executed plan."}</p></div>}
  </section>;
}
