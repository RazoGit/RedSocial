import { Suspense } from "react";
import type { Metadata } from "next";
import { LoaderCircle } from "lucide-react";

import { VerifyEmailForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Verificar email | R",
};

export default function VerifyEmailPage() {
  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold">Verificacion de cuenta</h1>
        <p className="text-muted-foreground mt-1 text-sm">Confirmando tu direccion de correo.</p>
      </div>
      <Suspense
        fallback={
          <div className="flex justify-center py-6">
            <LoaderCircle aria-hidden className="text-primary size-6 animate-spin" />
          </div>
        }
      >
        <VerifyEmailForm />
      </Suspense>
    </>
  );
}
