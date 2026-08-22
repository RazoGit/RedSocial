import Link from "next/link";

import type { ReactNode } from "react";

import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:56px_56px] opacity-40 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,black,transparent)]" />
        <div className="bg-primary/10 absolute top-[30%] left-1/2 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[110px]" />
      </div>

      <div className="relative flex w-full max-w-sm flex-col items-center gap-8">
        <Link href="/" aria-label="Ir al inicio">
          <Logo size={48} />
        </Link>
        <div className="border-border bg-card/40 w-full rounded-2xl border p-6 backdrop-blur">
          {children}
        </div>
      </div>
    </main>
  );
}
