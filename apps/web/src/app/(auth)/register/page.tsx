import type { Metadata } from "next";

import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Crear cuenta | R",
};

export default function RegisterPage() {
  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold">Unete a la revolucion</h1>
        <p className="text-muted-foreground mt-1 text-sm">Crea tu cuenta en menos de un minuto.</p>
      </div>
      <RegisterForm />
    </>
  );
}
