import { Suspense } from "react";
import type { Metadata } from "next";
import { LoaderCircle } from "lucide-react";

import { ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Restablecer contrasena | R",
};

export default function ResetPasswordPage() {
  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold">Nueva contrasena</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Elige una contrasena nueva para tu cuenta.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="flex justify-center py-6">
            <LoaderCircle aria-hidden className="text-primary size-6 animate-spin" />
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
