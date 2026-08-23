"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CheckUsernameResponseSchema,
  MeProfileResponseSchema,
  PresignAvatarResponseSchema,
  UsernameSchema,
  AVATAR_CONTENT_TYPES,
  AVATAR_MAX_BYTES,
} from "@redsocial/contracts";
import type { CheckUsernameResponse } from "@redsocial/contracts";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/user";
import { ApiError, getJson, patchJson, postJson, putBinary } from "@/lib/api-client";

const ProfileFormSchema = z.object({
  username: UsernameSchema,
  displayName: z.string().max(30).optional(),
  bio: z.string().max(200).optional(),
  isPrivate: z.boolean(),
});
type ProfileForm = z.infer<typeof ProfileFormSchema>;

const DEBOUNCE_MS = 350;
const AVATAR_POLL_INTERVAL_MS = 2000;
const AVATAR_POLL_MAX_MS = 40000;

type AvailabilityState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

function availabilityFrom(reason: CheckUsernameResponse["reason"]): AvailabilityState {
  switch (reason) {
    case "taken":
      return { kind: "error", message: "Ese username ya esta ocupado." };
    case "reserved":
      return { kind: "error", message: "Ese username esta reservado." };
    case "invalid_format":
      return {
        kind: "error",
        message: "3-20 caracteres: minusculas, numeros y guion bajo.",
      };
    default:
      return { kind: "error", message: "Username no disponible." };
  }
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

export function ProfileEditor() {
  const [loadError, setLoadError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<string>();
  const [availability, setAvailability] = useState<AvailabilityState>({ kind: "idle" });
  const [me, setMe] = useState<Awaited<ReturnType<typeof loadMe>>>();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(ProfileFormSchema),
    defaultValues: { username: "", displayName: "", bio: "", isPrivate: false },
  });

  async function loadMe() {
    return getJson("/users/me", MeProfileResponseSchema);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await loadMe();
        if (cancelled) return;
        setMe(profile);
        reset({
          username: profile.username,
          displayName: profile.displayName ?? "",
          bio: profile.bio ?? "",
          isPrivate: profile.isPrivate,
        });
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof ApiError && error.statusCode === 401
              ? "Inicia sesion para editar tu perfil."
              : "No se pudo cargar tu perfil.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const watchedUsername = watch("username");

  // RF-2/RF-7: disponibilidad con debounce; el propio username actual es valido.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const candidate = watchedUsername?.trim() ?? "";
    if (!candidate || !UsernameSchema.safeParse(candidate).success) {
      setAvailability({ kind: "idle" });
      return;
    }
    if (me && candidate.toLowerCase() === me.username.toLowerCase()) {
      setAvailability({ kind: "idle" });
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setAvailability({ kind: "checking" });
      try {
        const result = await getJson(
          `/users/check-username?u=${encodeURIComponent(candidate)}`,
          CheckUsernameResponseSchema,
        );
        setAvailability(
          result.available
            ? { kind: "ok", message: `"${candidate}" esta disponible.` }
            : availabilityFrom(result.reason),
        );
      } catch {
        setAvailability({ kind: "idle" });
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [watchedUsername, me]);

  const onSubmit = async (values: ProfileForm) => {
    setFormError(undefined);
    if (!me) return;

    const changes: Record<string, unknown> = {};
    if (values.username.toLowerCase() !== me.username.toLowerCase()) {
      changes.username = values.username;
    }
    if ((values.displayName ?? "") !== (me.displayName ?? "")) {
      changes.displayName = values.displayName === "" ? null : values.displayName;
    }
    if ((values.bio ?? "") !== (me.bio ?? "")) {
      changes.bio = values.bio === "" ? null : values.bio;
    }
    if (values.isPrivate !== me.isPrivate) {
      changes.isPrivate = values.isPrivate;
    }

    if (Object.keys(changes).length === 0) return;

    try {
      const updated = await patchJson("/users/me", changes, MeProfileResponseSchema);
      setMe(updated);
      reset({
        username: updated.username,
        displayName: updated.displayName ?? "",
        bio: updated.bio ?? "",
        isPrivate: updated.isPrivate,
      });
      setSavedAt(new Date());
      setAvailability({ kind: "idle" });
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(
          error.message === "username_cooldown_activo"
            ? "Solo puedes cambiar tu username cada 14 dias."
            : error.message === "username_reservado"
              ? "Ese username esta reservado."
              : error.message === "username_tomado"
                ? "Ese username ya esta ocupado."
                : error.message,
        );
      } else {
        setFormError("No se pudo guardar el perfil.");
      }
    }
  };

  const onAvatarSelected = async (file: File) => {
    setAvatarStatus(undefined);
    if (!(AVATAR_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      setAvatarStatus("Formato no admitido: usa JPEG, PNG o WebP.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarStatus("La imagen supera los 2 MB.");
      return;
    }

    try {
      setAvatarStatus("Preparando subida...");
      const presign = await postJson(
        "/users/me/avatar/presign",
        { contentType: file.type },
        PresignAvatarResponseSchema,
      );
      await putBinary(presign.uploadUrl, file, file.type);

      // El worker procesa con delay ~15 s: sondeo del /me hasta ver la URL.
      setAvatarStatus("Procesando imagen...");
      const deadline = Date.now() + AVATAR_POLL_MAX_MS;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, AVATAR_POLL_INTERVAL_MS));
        const fresh = await loadMe();
        setMe(fresh);
        if (fresh.avatarUrl) {
          setAvatarStatus("Avatar actualizado.");
          return;
        }
      }
      setAvatarStatus("Seguimos procesando la imagen; recarga en un momento.");
    } catch (error) {
      setAvatarStatus(error instanceof Error ? error.message : "No se pudo subir el avatar.");
    }
  };

  if (loadError) {
    return (
      <p role="alert" className="text-muted-foreground text-sm">
        {loadError}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
      <section className="flex items-center gap-4">
        <UserAvatar
          name={me?.displayName || me?.username || "?"}
          className="ring-primary/70 size-16 ring-2 ring-offset-2 ring-offset-background"
        />
        <div className="flex flex-col gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void onAvatarSelected(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!me || avatarStatus?.startsWith("Procesando")}
            onClick={() => fileInputRef.current?.click()}
          >
            Cambiar avatar
          </Button>
          {avatarStatus ? <p className="text-muted-foreground text-xs">{avatarStatus}</p> : null}
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Username</Label>
        <Input id="username" aria-invalid={Boolean(errors.username)} {...register("username")} />
        {errors.username ? (
          <p className="text-destructive text-xs">{errors.username.message}</p>
        ) : availability.kind === "checking" ? (
          <p className="text-muted-foreground flex items-center gap-1 text-xs">
            <LoaderCircle aria-hidden className="size-3 animate-spin" /> Comprobando...
          </p>
        ) : availability.kind === "ok" ? (
          <p className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <Check aria-hidden className="size-3" /> {availability.message}
          </p>
        ) : availability.kind === "error" ? (
          <p className="text-destructive flex items-center gap-1 text-xs">
            <CircleAlert aria-hidden className="size-3" /> {availability.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Nombre visible</Label>
        <Input id="displayName" placeholder="Tu nombre" {...register("displayName")} />
        {errors.displayName ? (
          <p className="text-destructive text-xs">{errors.displayName.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">Biografia</Label>
        <textarea
          id="bio"
          rows={3}
          maxLength={200}
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
          {...register("bio")}
        />
        {errors.bio ? <p className="text-destructive text-xs">{errors.bio.message}</p> : null}
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" className="accent-primary size-4" {...register("isPrivate")} />
        Perfil privado (solo muestran tu nombre y avatar a otros)
      </label>

      <FormError message={formError} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting || !me}>
          {isSubmitting ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
          Guardar cambios
        </Button>
        {savedAt ? (
          <span className="text-muted-foreground text-xs">
            Guardado a las {savedAt.toLocaleTimeString()}
          </span>
        ) : null}
        {me ? (
          <Link href={`/u/${me.username}`} className="text-primary ml-auto text-sm hover:underline">
            Ver perfil publico
          </Link>
        ) : null}
      </div>
    </form>
  );
}
