"use client";

import { useEffect, useState } from "react";
import { MeProfileResponseSchema, UserProfileResponseSchema } from "@redsocial/contracts";
import type { MinimalProfileResponse, UserProfileResponse } from "@redsocial/contracts";
import { LoaderCircle } from "lucide-react";

import { UserAvatar, VerifiedMark } from "@/components/user";
import { ApiError, getJson } from "@/lib/api-client";

interface ProfileViewProps {
  username: string;
}

/**
 * Vista publica /u/[username] (RF-5): consume el endpoint sin token; si el
 * perfil es privado la API responde con la vista minima y aqui se refleja.
 */
export function PublicProfile({ username }: ProfileViewProps) {
  const [profile, setProfile] = useState<UserProfileResponse | MinimalProfileResponse>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const full = await getJson(
          `/users/${encodeURIComponent(username)}`,
          UserProfileResponseSchema,
        );
        if (!cancelled) setProfile(full);
      } catch (caught) {
        if (cancelled) return;
        // Perfil privado: la vista minima tambien es un 200 valido.
        try {
          const minimal = await getJson(
            `/users/${encodeURIComponent(username)}`,
            MeProfileResponseSchema.pick({
              username: true,
              displayName: true,
              avatarUrl: true,
              avatarBlurhash: true,
            }),
          );
          setProfile(minimal as MinimalProfileResponse);
        } catch {
          setError(
            caught instanceof ApiError && caught.statusCode === 404
              ? "Este perfil no existe."
              : "No se pudo cargar el perfil.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (loading) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <LoaderCircle aria-hidden className="size-4 animate-spin" /> Cargando perfil...
      </p>
    );
  }

  if (error || !profile) {
    return (
      <p role="alert" className="text-muted-foreground text-sm">
        {error}
      </p>
    );
  }

  const isFull = "bio" in profile;

  return (
    <div className="flex flex-col items-center gap-3 pt-6 text-center">
      <UserAvatar
        name={profile.displayName || profile.username}
        className="ring-primary/70 size-20 ring-2 ring-offset-4 ring-offset-background"
      />
      <div>
        <h1 className="flex items-center justify-center gap-1.5 text-xl font-bold">
          {profile.displayName || profile.username}
          {isFull && profile.emailVerified ? <VerifiedMark className="size-5" /> : null}
        </h1>
        <p className="text-muted-foreground text-sm">@{profile.username}</p>
      </div>
      {isFull && profile.bio ? (
        <p className="text-muted-foreground max-w-sm whitespace-pre-line text-sm">{profile.bio}</p>
      ) : null}
      {!isFull ? <p className="text-muted-foreground text-xs">Este perfil es privado.</p> : null}
    </div>
  );
}
