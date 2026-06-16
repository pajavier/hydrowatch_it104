"use client";

import { ReactNode } from "react";
import { Navbar, Screen } from "./Navbar";

type AppLayoutProps = {
  activeScreen: Screen;
  children: ReactNode;
  onLogout: () => void;
  onNavigate: (screen: Screen) => void;
};

export function AppLayout({ activeScreen, children, onLogout, onNavigate }: AppLayoutProps) {
  return (
    <main className="relative min-h-screen bg-[#070B1A] text-white lg:flex">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-40 top-[-10%] h-[600px] w-[600px] rounded-full bg-sky-500/10 blur-[120px]" />
        <div className="absolute -right-40 bottom-[-10%] h-[600px] w-[600px] rounded-full bg-indigo-500/10 blur-[120px]" />
      </div>
      <Navbar activeScreen={activeScreen} onLogout={onLogout} onNavigate={onNavigate} />
      <section className="relative z-10 flex-1 p-4 sm:p-5">{children}</section>
    </main>
  );
}
