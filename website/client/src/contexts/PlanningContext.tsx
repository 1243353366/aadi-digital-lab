import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { sampleAssessment } from "@shared/sample";
import { useAuth } from "@/_core/hooks/useAuth";

export const blankAssessment = {
  ...sampleAssessment, projectName: "", budget: 0, objectives: "", companyGoals: "", departmentGoals: "", teamGoals: "", constraints: "", nonNegotiables: "", hiringConstraints: "", totalEmployees: 0, availablePersonnel: 0,
  capabilities: [] as string[], highRiskCategories: [] as string[], dataUseAuthorized: false, submitterName: "", submitterWorkEmail: "", authorityRole: "", decisionOwnerName: "", decisionOwnerRole: "", confidentialInfoIncluded: false, confidentialInfoAuthorized: false, highRiskOverrideAccepted: false,
};
type PlanningState = { mode: "director" | "agent"; setMode: (mode: "director" | "agent") => void; assessment: Record<string, any>; setAssessment: React.Dispatch<React.SetStateAction<Record<string, any>>>; result: any; setResult: (value: any) => void; demo: boolean; setDemo: (value: boolean) => void };
const PlanningContext = createContext<PlanningState | null>(null);
export function PlanningProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<"director" | "agent">("director");
  const [assessment, setAssessment] = useState<Record<string, any>>(blankAssessment);
  const [result, setResult] = useState<any>(null);
  const [demo, setDemo] = useState(false);
  const { user, loading } = useAuth();
  const previousUser = useRef<number | null>(null);
  useEffect(() => {
    if (loading) return;
    if (previousUser.current !== null && previousUser.current !== (user?.id ?? null)) {
      setAssessment({ ...blankAssessment }); setResult(null); setDemo(false);
    }
    previousUser.current = user?.id ?? null;
  }, [user?.id, loading]);
  return <PlanningContext.Provider value={{ mode, setMode, assessment, setAssessment, result, setResult, demo, setDemo }}>{children}</PlanningContext.Provider>;
}
export function usePlanning() { const state = useContext(PlanningContext); if (!state) throw new Error("Planning state unavailable"); return state; }
