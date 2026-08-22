import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:56px_56px] opacity-60 [mask-image:radial-gradient(ellipse_65%_55%_at_50%_38%,black,transparent)]" />
        <div className="absolute top-[36%] left-1/2 size-100 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/12 blur-[110px]" />
      </div>

      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <section className="relative flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 scale-[1.75] rounded-full bg-primary/20 blur-2xl"
          />
          <Logo size={96} />
        </div>

        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          <span className="block sm:inline">Conecta.</span>{" "}
          <span className="block sm:inline">Comparte.</span>{" "}
          <span className="text-primary block [text-shadow:0_0_28px_var(--primary)] sm:inline">
            Revoluciona.
          </span>
        </h1>

        <p className="text-muted-foreground max-w-md text-base sm:text-lg">
          Una nueva forma de conectar está aquí.
        </p>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button size="lg" type="button" className="sm:w-44" asChild>
            <Link href="/register">Crear cuenta</Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            type="button"
            className="border-primary/60 text-primary hover:bg-primary/10 hover:text-primary sm:w-44"
            asChild
          >
            <Link href="/login">Iniciar sesión</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
