"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { parseCallbackFragment, setAuthSession } from "@/lib/auth-session";

type Status = "processing" | "error";

/**
 * RF-9 (T13): destino del redirect del callback OAuth de la API.
 * Recibe los tokens en el fragmento (#), guarda el access token en
 * memoria, limpia el fragmento del historial y redirige al feed.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("processing");

  useEffect(() => {
    const tokens = parseCallbackFragment(window.location.hash);

    // El fragmento se elimina siempre: los tokens no deben permanecer
    // en la entrada del historial ni poder copiarse de la barra.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    if (!tokens) {
      setStatus("error");
      return;
    }

    setAuthSession({
      accessToken: tokens.accessToken,
      csrfToken: tokens.csrfToken,
      expiresAt: Date.now() + tokens.expiresIn * 1000,
    });
    // replace: volver atras nunca debe mostrar esta pagina ya consumida.
    router.replace("/feed");
  }, [router]);

  if (status === "error") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-4">
        <div className="border-border bg-card/40 flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border p-8 text-center">
          <Logo size={48} />
          <h1 className="text-lg font-semibold">No pudimos completar el ingreso</h1>
          <p className="text-muted-foreground text-sm">
            El enlace expiro o es invalido. Vuelve a intentarlo desde el inicio de sesion.
          </p>
          <Button asChild size="sm">
            <Link href="/login">Volver a iniciar sesion</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
      <LoaderCircle aria-hidden className="text-primary size-8 animate-spin" />
      <p className="text-muted-foreground text-sm">Preparando tu sesion...</p>
    </main>
  );
}
