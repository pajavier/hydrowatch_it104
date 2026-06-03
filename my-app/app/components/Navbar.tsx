"use client";

import Image from "next/image";
import { ReactNode, useState } from "react";

export type Screen = "dashboard" | "alerts" | "settings" | "logs";

type NavbarProps = {
  activeScreen: Screen;
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
};

const navItems: Array<{ icon: ReactNode; label: string; screen: Screen }> = [
  { icon: <DashboardIcon />, label: "Dashboard", screen: "dashboard" },
  { icon: <AlertIcon />, label: "Alerts", screen: "alerts" },
  { icon: <LogsIcon />, label: "Logs", screen: "logs" },
  { icon: <SettingsIcon />, label: "Settings", screen: "settings" },
];

export function Navbar({ activeScreen, onNavigate, onLogout }: NavbarProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleNavigate = (screen: Screen) => {
    onNavigate(screen);
    setIsMobileOpen(false);
  };

  return (
    <>
      <aside
        className={`hidden min-h-screen shrink-0 border-r border-white/10 bg-[#0D1430]/95 p-4 transition-[width] duration-300 ease-out lg:flex lg:flex-col ${
          isSidebarCollapsed ? "w-24" : "w-72"
        }`}
      >
        <div
          className={`flex min-h-16 w-full items-center ${
            isSidebarCollapsed ? "flex-col justify-center gap-4" : "justify-between gap-2"
          }`}
        >
          <div className={`flex min-w-0 items-center ${isSidebarCollapsed ? "justify-center" : "flex-1 gap-1"}`}>
            <Logo />
            <h1
              className={`overflow-hidden whitespace-nowrap text-center text-base font-extrabold transition-all duration-200 ${
                isSidebarCollapsed ? "w-0 opacity-0" : "flex-1 opacity-100"
              }`}
            >
              Hydrowatch
            </h1>
          </div>
          <button
            aria-expanded={!isSidebarCollapsed}
            aria-label={isSidebarCollapsed ? "Expand sidebar navigation" : "Collapse sidebar navigation"}
            className={`rounded-xl border border-white/10 p-2 text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-300 ${
              isSidebarCollapsed ? "mx-auto" : "ml-auto"
            }`}
            onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
            type="button"
          >
            <ChevronIcon collapsed={isSidebarCollapsed} />
          </button>
        </div>

        <nav className="mt-7 flex-1 space-y-2" aria-label="Primary navigation">
          {navItems.map((item) => (
            <NavButton
              active={activeScreen === item.screen}
              collapsed={isSidebarCollapsed}
              icon={item.icon}
              key={item.screen}
              label={item.label}
              onClick={() => handleNavigate(item.screen)}
            />
          ))}
        </nav>

        <button
          aria-label={isSidebarCollapsed ? "Logout" : undefined}
          className={`flex w-full items-center gap-3 rounded-xl border border-red-400/35 px-3 py-2 text-red-300 transition hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-300 ${
            isSidebarCollapsed ? "justify-center" : ""
          }`}
          onClick={onLogout}
          title={isSidebarCollapsed ? "Logout" : undefined}
          type="button"
        >
          <LogoutIcon />
          <span
            className={`overflow-hidden whitespace-nowrap transition-all duration-200 ${
              isSidebarCollapsed ? "w-0 opacity-0" : "w-20 opacity-100"
            }`}
          >
            Logout
          </span>
        </button>
      </aside>

      <header className="border-b border-white/10 bg-[#0D1430]/95 lg:hidden">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Logo mobile />
            <h1 className="text-xl font-extrabold">Hydrowatch</h1>
          </div>
          <button
            aria-expanded={isMobileOpen}
            aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"}
            className="rounded-xl border border-white/10 p-2 text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-300"
            onClick={() => setIsMobileOpen((open) => !open)}
            type="button"
          >
            <span className={`block transition-transform duration-200 ${isMobileOpen ? "rotate-90" : ""}`}>
              {isMobileOpen ? <XIcon /> : <MenuIcon />}
            </span>
          </button>
        </div>

        <div
          aria-hidden={!isMobileOpen}
          className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
            isMobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setIsMobileOpen(false)}
        />

        <aside
          className={`fixed left-0 top-0 z-50 h-full w-72 border-r border-white/10 bg-[#0D1430] p-4 shadow-2xl transition-transform duration-300 ease-out ${
            isMobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo mobile />
              <h2 className="text-xl font-extrabold">Hydrowatch</h2>
            </div>
            <button
              aria-label="Close navigation menu"
              className="rounded-xl border border-white/10 p-2 text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-300"
              onClick={() => setIsMobileOpen(false)}
              type="button"
            >
              <XIcon />
            </button>
          </div>

          <nav className="mt-8 space-y-2" aria-label="Mobile navigation">
            {navItems.map((item) => (
              <NavButton
                active={activeScreen === item.screen}
                icon={item.icon}
                key={item.screen}
                label={item.label}
                onClick={() => handleNavigate(item.screen)}
              />
            ))}
            <button
              className="mt-4 flex w-full items-center gap-3 rounded-xl border border-red-400/35 px-3 py-3 text-left text-red-300 transition hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-300"
              onClick={onLogout}
              type="button"
            >
              <LogoutIcon />
              <span>Logout</span>
            </button>
          </nav>
        </aside>
      </header>
    </>
  );
}

function Logo({ mobile = false }: { mobile?: boolean }) {
  return (
    <Image
      alt="Hydrowatch logo"
      className={mobile ? "h-14 w-14 object-contain" : "h-20 w-20 object-contain"}
      height={80}
      priority
      src="/hydrowatch-logo.png"
      width={80}
    />
  );
}

function NavButton({
  active = false,
  collapsed = false,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  collapsed?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={collapsed ? label : undefined}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-300 lg:py-2 ${
        collapsed ? "justify-center" : ""
      } ${active ? "bg-sky-400/15 text-sky-200" : "text-slate-300 hover:bg-white/10"}`}
      onClick={onClick}
      title={collapsed ? label : undefined}
      type="button"
    >
      <span className="shrink-0">{icon}</span>
      <span
        className={`overflow-hidden whitespace-nowrap transition-all duration-200 ${
          collapsed ? "w-0 opacity-0" : "w-28 opacity-100"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-5 w-5 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M4 5h7v7H4V5Zm9 0h7v4h-7V5ZM4 14h7v5H4v-5Zm9-3h7v8h-7v-8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function LogsIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M7 6h10M7 10h10M7 14h6M5 3h14a1 1 0 0 1 1 1v16l-3-2-3 2-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 3 3 19h18L12 3Zm0 5v5m0 4h.01"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" stroke="currentColor" strokeWidth="2" />
      <path d="M19.4 15a8.2 8.2 0 0 0 .1-1l2-1.5-2-3.5-2.4 1a7.7 7.7 0 0 0-1.7-1L15 6.5h-4L10.6 9a7.7 7.7 0 0 0-1.7 1L6.5 9l-2 3.5 2 1.5a8.2 8.2 0 0 0 .1 2l-2 1.5 2 3.5 2.4-1a7.7 7.7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.7 7.7 0 0 0 1.7-1l2.4 1 2-3.5-2.2-1.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24">
      <path d="M10 17l5-5-5-5M15 12H3M21 4v16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}
