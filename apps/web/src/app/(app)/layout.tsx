import type { ReactNode } from "react";

import { AppSidebar, BottomNav, TopBar } from "@/components/nav/navigation";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <AppSidebar />
      <TopBar />
      <div className="md:pl-64">
        <main className="mx-auto w-full max-w-2xl px-4 pt-4 pb-28 md:pb-12">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
