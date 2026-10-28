import { useAuth } from "@/_core/hooks/useAuth";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { Link, useLocation } from "wouter";
import { Compass, LayoutDashboard, FilePlus2, FileCheck2, Layers3, ShieldCheck, Network, ScanLine, ArrowUpRight, LogOut, LockKeyhole, ChevronRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

const primary = [
  { label: "Overview", path: "/", icon: LayoutDashboard },
  { label: "New assessment", path: "/assess", icon: FilePlus2 },
  { label: "Decision brief", path: "/brief", icon: FileCheck2 },
  { label: "Framework library", path: "/frameworks", icon: Layers3 },
];
const governance = [
  { label: "Safety & data", path: "/safety", icon: ShieldCheck },
  { label: "Shared system", path: "/system", icon: Network },
  { label: "Device scanner", path: "/scanner", icon: ScanLine },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const current = [...primary, ...governance].find(item => item.path === location)?.label || "Workspace";
  return <SidebarProvider style={{ "--sidebar-width": "248px" } as CSSProperties}>
    <Sidebar collapsible="offcanvas" className="compass-sidebar border-0">
      <SidebarHeader className="p-7 pb-8">
        <Link href="/" className="brand"><span className="brand-mark"><Compass size={25} strokeWidth={1.7} /></span><span>compass<span className="brand-sub">PLANNING STUDIO</span></span></Link>
        <div className="workspace-switch"><span className="workspace-initial">C</span><div><strong>Compass workspace</strong><span>Decision support</span></div><ChevronRight size={14}/></div>
      </SidebarHeader>
      <SidebarContent className="px-4">
        <p className="nav-label">WORKSPACE</p>
        <SidebarMenu>{primary.map(item => <SidebarMenuItem key={item.path}><SidebarMenuButton tooltip={item.label} isActive={location === item.path} onClick={() => navigate(item.path)} className="compass-nav"><item.icon size={19}/><span>{item.label}</span>{location === item.path && <span className="nav-dot"/>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>
        <p className="nav-label mt-8">GOVERNANCE</p>
        <SidebarMenu>{governance.map(item => <SidebarMenuItem key={item.path}><SidebarMenuButton tooltip={item.label} isActive={location === item.path} onClick={() => navigate(item.path)} className="compass-nav"><item.icon size={19}/><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>
        <div className="sidebar-core"><Network size={20}/><div><strong>Corpora Core</strong><span>Shared, request-scoped backbone</span></div><span className="core-light"/></div>
      </SidebarContent>
      <SidebarFooter className="p-5 pt-8">
        <a className="lab-link" href="https://github.com/1243353366/aadi-digital-lab" target="_blank" rel="noreferrer">Aadi’s Digital Lab <ArrowUpRight size={15}/></a>
        <div className="sidebar-user"><span className="user-avatar">{user?.name?.slice(0, 1) || "G"}</span><div><strong>{user?.name || "Guest workspace"}</strong><span>{user ? (user.role === "admin" ? "Workspace administrator" : "Read-only member") : "Explore the sample brief"}</span></div>{user && <button aria-label="Sign out" onClick={() => logout()}><LogOut size={16}/></button>}</div>
      </SidebarFooter>
    </Sidebar>
    <SidebarInset className="site-inset">
      <header className="topbar"><div className="breadcrumb"><SidebarTrigger className="md:hidden"/><span>Workspace</span><ChevronRight size={13}/><strong>{current}</strong></div><div className="topbar-actions"><span className="purpose-chip"><LockKeyhole size={12}/> Purpose-limited</span>{!user ? <Button size="sm" variant="outline" onClick={() => startLogin()}>Sign in <ArrowUpRight size={13}/></Button> : <span className="header-avatar">{user.name?.slice(0, 1) || "A"}</span>}</div></header>
      <main className="page-content">{children}</main>
      <footer className="workspace-footer"><span>Compass · Reasoning informs. People decide.</span><Link href="/safety">Authorization & purpose limitation</Link></footer>
    </SidebarInset>
  </SidebarProvider>;
}
