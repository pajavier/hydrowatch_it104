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
    <main className="min-h-screen bg-[#070B1A] text-white lg:flex">
      <Navbar activeScreen={activeScreen} onLogout={onLogout} onNavigate={onNavigate} />
      <section className="flex-1 p-5">{children}</section>
    </main>
  );
}
