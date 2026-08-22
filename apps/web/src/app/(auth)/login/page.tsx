import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Iniciar sesion | R",
};

export default function LoginPage() {
  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold">Bienvenido de nuevo</h1>
        <p className="text-muted-foreground mt-1 text-sm">Entra para seguir conectado.</p>
      </div>
      <LoginForm />
    </>
  );
}
