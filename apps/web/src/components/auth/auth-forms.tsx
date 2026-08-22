"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RegisterRequestSchema } from "@redsocial/contracts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function DemoHint() {
  return (
    <p className="text-muted-foreground text-center text-xs">
      Demo visual: la conexion con la API llega al completar la spec 001.
    </p>
  );
}

interface FieldError {
  field: string;
  message: string;
}

function useFormErrors() {
  const [errors, setErrors] = useState<FieldError[]>([]);
  const errorFor = (field: string) => errors.find((error) => error.field === field)?.message;

  return { errors, setErrors, errorFor };
}

function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="text-destructive text-xs">{children}</p>;
}

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const { setErrors, errorFor } = useFormErrors();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!data.get("email") || !data.get("password")) {
      setErrors([
        { field: "email", message: "El email es obligatorio" },
        { field: "password", message: "La contrasena es obligatoria" },
      ]);
      return;
    }
    setErrors([]);
    setPending(true);
    setTimeout(() => router.push("/feed"), 500);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="tu@email.com"
          autoComplete="email"
        />
        <ErrorText>{errorFor("email")}</ErrorText>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Contrasena</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="Tu contrasena"
          autoComplete="current-password"
        />
        <ErrorText>{errorFor("password")}</ErrorText>
      </div>

      <Link href="/forgot-password" className="text-primary text-right text-xs hover:underline">
        Olvide mi contrasena
      </Link>

      <Button type="submit" disabled={pending}>
        {pending ? "Entrando..." : "Iniciar sesion"}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        No tienes cuenta?{" "}
        <Link href="/register" className="text-primary hover:underline">
          Registrate
        </Link>
      </p>

      <DemoHint />
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const { setErrors, errorFor } = useFormErrors();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = RegisterRequestSchema.safeParse({
      email: data.get("email"),
      password: data.get("password"),
    });

    if (!parsed.success) {
      setErrors(
        parsed.error.issues.map((issue) => ({
          field: String(issue.path[0] ?? ""),
          message: issue.message,
        })),
      );
      return;
    }
    setErrors([]);
    setPending(true);
    setTimeout(() => router.push("/feed"), 700);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="tu@email.com"
          autoComplete="email"
        />
        <ErrorText>{errorFor("email")}</ErrorText>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Contrasena</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="Minimo 10 caracteres"
          autoComplete="new-password"
        />
        <ErrorText>{errorFor("password")}</ErrorText>
      </div>

      <ul className="text-muted-foreground list-inside list-disc text-xs">
        <li>Minimo 10 y maximo 128 caracteres</li>
        <li>Una mayuscula, una minuscula y un numero</li>
      </ul>

      <Button type="submit" disabled={pending}>
        {pending ? "Creando cuenta..." : "Crear cuenta"}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        Ya tienes cuenta?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Inicia sesion
        </Link>
      </p>

      <DemoHint />
    </form>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <h1 className="text-lg font-semibold">Revisa tu correo</h1>
        <p className="text-muted-foreground max-w-xs text-sm">
          Si el email existe, te enviamos un enlace para restablecer tu contrasena.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/login">Volver a iniciar sesion</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setSent(true);
      }}
      noValidate
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="tu@email.com"
          autoComplete="email"
        />
      </div>
      <Button type="submit">Enviar enlace</Button>

      <p className="text-muted-foreground text-center text-sm">
        Recordaste la contrasena?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Inicia sesion
        </Link>
      </p>

      <DemoHint />
    </form>
  );
}
