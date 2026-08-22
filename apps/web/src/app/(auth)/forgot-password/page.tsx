import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Recuperar contrasena | R",
};

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold">Recuperar contrasena</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Te enviaremos un enlace de recuperacion.
        </p>
      </div>
      <ForgotPasswordForm />
    </>
  );
}
