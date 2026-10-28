import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import { PlanningProvider } from "./contexts/PlanningContext";
import { Route, Switch } from "wouter";
import Home from "./pages/Home";
import Assessment from "./pages/Assessment";
import Brief from "./pages/Brief";
import Frameworks from "./pages/Frameworks";
import { Safety, System } from "./pages/Governance";
import Scanner from "./pages/Scanner";
import NotFound from "./pages/NotFound";

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><PlanningProvider><Toaster/><DashboardLayout><Switch><Route path="/" component={Home}/><Route path="/assess" component={Assessment}/><Route path="/brief" component={Brief}/><Route path="/frameworks" component={Frameworks}/><Route path="/safety" component={Safety}/><Route path="/system" component={System}/><Route path="/scanner" component={Scanner}/><Route component={NotFound}/></Switch></DashboardLayout></PlanningProvider></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
