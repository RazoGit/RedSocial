"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { MeProfileResponseSchema, UserProfileResponseSchema } from "@redsocial/contracts";
import type {
  MinimalProfileResponse,
  PostResponse,
  UserProfileResponse,
} from "@redsocial/contracts";
import { PostResponseSchema } from "@redsocial/contracts";
import { LoaderCircle } from "lucide-react";

import { UserAvatar, VerifiedMark } from "@/components/user";
import { Button } from "@/components/ui/button";
import { ApiError, getJson } from "@/lib/api-client";

interface ProfileViewProps {
  username: string;
}

function PostThumbnail({ post }: { post: PostResponse }) {
  const mediaItem = post.media[0];
  return (
    <Link
      href={`/post/${post.id}`}
      className="border-border bg-card/40 relative block aspect-square overflow-hidden rounded-xl border transition-opacity hover:opacity-90"
    >
      {mediaItem?.thumbKey ? (
        <div className="absolute inset-0 bg-muted" />
      ) : post.text ? (
        <div className="bg-primary/5 flex size-full items-center justify-center p-3">
          <p className="text-muted-foreground line-clamp-4 text-center text-xs leading-relaxed">
            {post.text}
          </p>
        </div>
      ) : (
        <div className="bg-muted size-full" />
      )}
    </Link>
  );
}

/**
 * Vista publica /u/[username] (RF-5): consume el endpoint sin token; si el
 * perfil es privado la API responde con la vista minima y aqui se refleja.
 * Incluye grid de posts paginados.
 */
export function PublicProfile({ username }: ProfileViewProps) {
  const [profile, setProfile] = useState<UserProfileResponse | MinimalProfileResponse>();
  const [posts, setPosts] = useState<PostResponse[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();

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

  useEffect(() => {
    if (loading || error) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getJson(
          `/posts/user/${encodeURIComponent(username)}?limit=20`,
          PostResponseSchema.extend({
            items: PostResponseSchema.array(),
            nextCursor: PostResponseSchema.shape.createdAt.nullable(),
          }),
        );
        if (!cancelled) {
          setPosts(data.items);
          setNextCursor(data.nextCursor);
        }
      } catch {
        // Feed vacio o error silencioso
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, error, username]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await getJson(
        `/posts/user/${encodeURIComponent(username)}?limit=20&createdBefore=${encodeURIComponent(nextCursor)}`,
        PostResponseSchema.extend({
          items: PostResponseSchema.array(),
          nextCursor: PostResponseSchema.shape.createdAt.nullable(),
        }),
      );
      setPosts((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch {
      // Silencioso
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, username]);

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
    <div className="flex flex-col gap-6">
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
          <p className="text-muted-foreground max-w-sm whitespace-pre-line text-sm">
            {profile.bio}
          </p>
        ) : null}
        {!isFull ? <p className="text-muted-foreground text-xs">Este perfil es privado.</p> : null}
      </div>

      {isFull && (
        <section>
          <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
            Publicaciones
          </h2>
          {posts.length === 0 ? (
            <p className="text-muted-foreground text-center text-sm">No hay publicaciones aun.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {posts.map((post) => (
                  <PostThumbnail key={post.id} post={post} />
                ))}
              </div>
              {nextCursor && (
                <div className="mt-4 flex justify-center">
                  <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Cargando..." : "Cargar mas"}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
