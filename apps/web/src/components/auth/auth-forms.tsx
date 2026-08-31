"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AcceptedResponseSchema,
  AuthSessionResponseSchema,
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  PasswordSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
  ResendVerificationRequestSchema,
  ResetPasswordResponseSchema,
} from "@redsocial/contracts";
import type {
  ForgotPasswordRequest,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
} from "@redsocial/contracts";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError, postJson } from "@/lib/api-client";
import { setAuthSession } from "@/lib/auth-session";

function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="text-destructive text-xs">{children}</p>;
}

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-xs"
    >
      {message}
    </p>
  );
}

function SubmitButton({ pending, children }: { pending: boolean; children: string }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(LoginRequestSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginRequest) => {
    setFormError(undefined);
    try {
      const session = await postJson("/auth/login", values, LoginResponseSchema);
      setAuthSession({
        accessToken: session.accessToken,
        csrfToken: session.csrfToken,
        expiresAt: Date.now() + session.expiresIn * 1000,
      });
      // replace: hacia atras no debe volver al login con sesion ya activa.
      router.replace("/feed");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo iniciar sesion.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="tu@email.com"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          {...register("email")}
        />
        <ErrorText>{errors.email?.message}</ErrorText>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Contrasena</Label>
        <PasswordInput
          id="password"
          placeholder="Tu contrasena"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          {...register("password")}
        />
        <ErrorText>{errors.password?.message}</ErrorText>
      </div>

      <Link href="/forgot-password" className="text-primary text-right text-xs hover:underline">
        Olvide mi contrasena
      </Link>

      <FormError message={formError} />

      <SubmitButton pending={isSubmitting}>Iniciar sesion</SubmitButton>

      <p className="text-muted-foreground text-center text-sm">
        No tienes cuenta?{" "}
        <Link href="/register" className="text-primary hover:underline">
          Registrate
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [created, setCreated] = useState<RegisterResponse>();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterRequest>({
    resolver: zodResolver(RegisterRequestSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: RegisterRequest) => {
    setFormError(undefined);
    try {
      const response = await postJson("/auth/register", values, RegisterResponseSchema);
      setCreated(response);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo crear la cuenta.");
    }
  };

  if (created) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <h1 className="text-lg font-semibold">Revisa tu correo</h1>
        <p className="text-muted-foreground max-w-xs text-sm">
          Te enviamos un enlace de verificacion a{" "}
          <span className="text-foreground font-medium">{created.email}</span>. Verifica tu cuenta
          para poder iniciar sesion.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/login">Volver a iniciar sesion</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="tu@email.com"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          {...register("email")}
        />
        <ErrorText>{errors.email?.message}</ErrorText>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Contrasena</Label>
        <PasswordInput
          id="password"
          placeholder="Minimo 10 caracteres"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          {...register("password")}
        />
        <ErrorText>{errors.password?.message}</ErrorText>
      </div>

      <ul className="text-muted-foreground list-inside list-disc text-xs">
        <li>Minimo 10 y maximo 128 caracteres</li>
        <li>Una mayuscula, una minuscula y un numero</li>
      </ul>

      <FormError message={formError} />

      <SubmitButton pending={isSubmitting}>Crear cuenta</SubmitButton>

      <p className="text-muted-foreground text-center text-sm">
        Ya tienes cuenta?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Inicia sesion
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(ForgotPasswordRequestSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ForgotPasswordRequest) => {
    setFormError(undefined);
    try {
      await postJson("/auth/forgot-password", values, AcceptedResponseSchema);
      setSent(true);
    } catch (error) {
      // La respuesta 202 nunca revela si el email existe; solo los fallos
      // de red o del servidor llegan aqui.
      setFormError(error instanceof Error ? error.message : "No se pudo enviar el enlace.");
    }
  };

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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="tu@email.com"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          {...register("email")}
        />
        <ErrorText>{errors.email?.message}</ErrorText>
      </div>

      <FormError message={formError} />

      <SubmitButton pending={isSubmitting}>Enviar enlace</SubmitButton>

      <p className="text-muted-foreground text-center text-sm">
        Recordaste la contrasena?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Inicia sesion
        </Link>
      </p>
    </form>
  );
}

const ResetPasswordFormSchema = z
  .object({
    token: z.string(),
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contrasenas no coinciden",
    path: ["confirmPassword"],
  });

type ResetPasswordFormData = z.infer<typeof ResetPasswordFormSchema>;

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [resetDone, setResetDone] = useState(false);
  const [invalidToken, setInvalidToken] = useState(false);
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(ResetPasswordFormSchema),
    defaultValues: { token, password: "", confirmPassword: "" },
  });

  const tokenValid = token.length >= 32 && token.length <= 128;

  if (!resetDone && !invalidToken && !tokenValid) {
    return <InvalidTokenPanel />;
  }

  const onSubmit = async (values: ResetPasswordFormData) => {
    setFormError(undefined);
    try {
      await postJson(
        "/auth/reset-password",
        { token: values.token, password: values.password },
        ResetPasswordResponseSchema,
      );
      setResetDone(true);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 400) {
        setInvalidToken(true);
        return;
      }
      setFormError(error instanceof Error ? error.message : "No se pudo restablecer.");
    }
  };

  if (resetDone) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <h1 className="text-lg font-semibold">Contrasena restablecida</h1>
        <p className="text-muted-foreground max-w-xs text-sm">
          Tu contrasena se actualizo y se cerraron todas las sesiones activas. Inicia sesion con tu
          nueva contrasena.
        </p>
        <Button size="sm" onClick={() => router.push("/login")}>
          Ir a iniciar sesion
        </Button>
      </div>
    );
  }

  if (invalidToken) {
    return <InvalidTokenPanel />;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Nueva contrasena</Label>
        <PasswordInput
          id="password"
          placeholder="Minimo 10 caracteres"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          {...register("password")}
        />
        <ErrorText>{errors.password?.message}</ErrorText>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Confirmar contrasena</Label>
        <PasswordInput
          id="confirmPassword"
          placeholder="Repite la contrasena"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirmPassword)}
          {...register("confirmPassword")}
        />
        <ErrorText>{errors.confirmPassword?.message}</ErrorText>
      </div>

      <ul className="text-muted-foreground list-inside list-disc text-xs">
        <li>Minimo 10 y maximo 128 caracteres</li>
        <li>Una mayuscula, una minuscula y un numero</li>
      </ul>

      <FormError message={formError} />

      <SubmitButton pending={isSubmitting}>Restablecer contrasena</SubmitButton>

      <p className="text-muted-foreground text-center text-sm">
        Recordaste la contrasena?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Inicia sesion
        </Link>
      </p>
    </form>
  );
}

function InvalidTokenPanel() {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <h1 className="text-lg font-semibold">Enlace invalido o expirado</h1>
      <p className="text-muted-foreground max-w-xs text-sm">
        El enlace de restablecimiento no es valido o ya fue usado. Solicita uno nuevo.
      </p>
      <Button variant="outline" size="sm" asChild>
        <Link href="/forgot-password">Solicitar nuevo enlace</Link>
      </Button>
    </div>
  );
}

type VerifyStatus = "processing" | "success" | "error";

/**
 * Destino del enlace de verificacion del correo de registro
 * (`/verify-email?token=...`). Confirma el token al aterrizar; como la API
 * emite sesion al verificar, deja al usuario dentro y va al feed. Si el
 * enlace fallo, ofrece reenviar el correo.
 */
export function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<VerifyStatus>("processing");
  const started = useRef(false);

  useEffect(() => {
    // Strict mode monta dos veces en dev: la verificacion es de un solo
    // uso, asi que se ejecuta exactamente una vez por pagina real.
    if (started.current) return;
    started.current = true;

    if (token.length < 32 || token.length > 128) {
      setStatus("error");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const session = await postJson("/auth/verify-email", { token }, AuthSessionResponseSchema);
        if (cancelled) return;
        setAuthSession({
          accessToken: session.accessToken,
          csrfToken: session.csrfToken,
          expiresAt: Date.now() + session.expiresIn * 1000,
        });
        setStatus("success");
        router.replace("/feed");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      {status === "processing" ? (
        <>
          <LoaderCircle aria-hidden className="text-primary size-8 animate-spin" />
          <p className="text-muted-foreground text-sm">Confirmando tu cuenta...</p>
        </>
      ) : status === "success" ? (
        <>
          <h1 className="text-lg font-semibold">Cuenta verificada</h1>
          <p className="text-muted-foreground text-sm">Te llevamos a tu feed.</p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold">Enlace invalido o expirado</h1>
          <p className="text-muted-foreground max-w-xs text-sm">
            Este enlace ya fue usado o vencio (dura 24 horas). Puedes solicitar otro correo de
            verificacion abajo.
          </p>
          <ResendVerificationForm />
        </>
      )}
    </div>
  );
}

function ResendVerificationForm() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({
    resolver: zodResolver(ResendVerificationRequestSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: { email: string }) => {
    setFormError(undefined);
    try {
      await postJson("/auth/resend-verification", values, AcceptedResponseSchema);
      setSent(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo reenviar el correo.");
    }
  };

  if (sent) {
    return (
      <p className="text-primary text-xs">
        Si el email existe, te enviamos un nuevo enlace de verificacion.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex w-full flex-col gap-2" noValidate>
      <div className="flex flex-col gap-2 text-left">
        <Label htmlFor="resend-email">Email</Label>
        <Input
          id="resend-email"
          type="email"
          placeholder="tu@email.com"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          {...register("email")}
        />
        <ErrorText>{errors.email?.message}</ErrorText>
      </div>
      <FormError message={formError} />
      <Button type="submit" variant="outline" size="sm" disabled={isSubmitting}>
        Reenviar correo de verificacion
      </Button>
      <p className="text-muted-foreground text-center text-xs">
        <Link href="/login" className="text-primary hover:underline">
          Volver a iniciar sesion
        </Link>
      </p>
    </form>
  );
}
