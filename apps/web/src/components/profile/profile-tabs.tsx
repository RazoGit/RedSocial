"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, LoaderCircle, MessageCircle } from "lucide-react";
import { PaginatedPostsResponseSchema, UserProfileResponseSchema } from "@redsocial/contracts";
import type { PostResponse, UserProfileResponse } from "@redsocial/contracts";

import { Button } from "@/components/ui/button";
import { getJson } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { cn } from "@/lib/utils";

type ProfileTab = "publicaciones" | "respuestas" | "guardados";

const tabs: { value: ProfileTab; label: string }[] = [
  { value: "publicaciones", label: "Publicaciones" },
  { value: "respuestas", label: "Respuestas" },
  { value: "guardados", label: "Guardados" },
];

function EmptyTab({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Bookmark;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground max-w-xs text-sm">{description}</p>
    </div>
  );
}

function PostThumbnail({ post }: { post: PostResponse }) {
  return (
    <Link
      href={`/post/${post.id}`}
      aria-label={`Publicacion de ${post.author.username}`}
      className="border-border bg-muted relative block aspect-square overflow-hidden rounded-lg border transition-opacity hover:opacity-80"
    >
      {post.text ? (
        <div className="bg-primary/5 absolute inset-0 flex items-center justify-center p-3">
          <p className="text-muted-foreground line-clamp-4 text-center text-xs leading-relaxed">
            {post.text}
          </p>
        </div>
      ) : (
        <span aria-hidden className="absolute inset-0" />
      )}
    </Link>
  );
}

export function ProfileTabs() {
  const { me } = useMe();
  const [tab, setTab] = useState<ProfileTab>("publicaciones");
  const [profile, setProfile] = useState<UserProfileResponse>();
  const [posts, setPosts] = useState<PostResponse[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!me?.username) return;
    let cancelled = false;
    (async () => {
      try {
        const full = await getProfile(me.username);
        if (!cancelled) setProfile(full);
      } catch {
        // Perfil privado: solo la vista minima no tiene contadores.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.username]);

  useEffect(() => {
    if (!me?.username) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getPosts(me.username, undefined);
        if (!cancelled) {
          setPosts(data.items);
          setNextCursor(data.nextCursor);
        }
      } catch {
        // Silencioso
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.username]);

  const loadMore = useCallback(async () => {
    if (!me?.username || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await getPosts(me.username, nextCursor);
      setPosts((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch {
      // Silencioso
    } finally {
      setLoadingMore(false);
    }
  }, [me?.username, nextCursor, loadingMore]);

  const username = me?.username ?? "-";
  const postsCount = posts.length;

  return (
    <section className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Contenido del perfil"
        className="border-border grid grid-cols-3 border-b"
      >
        {tabs.map((item) => (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={tab === item.value}
            onClick={() => setTab(item.value)}
            className={cn(
              "border-b-2 pb-3 text-sm font-medium transition-colors",
              tab === item.value
                ? "border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "publicaciones" ? (
        <>
          <dl className="grid grid-cols-3 gap-2 py-1 text-center">
            <div>
              <dt className="text-muted-foreground order-last text-xs">Publicaciones</dt>
              <dd className="text-lg font-bold">{postsCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground order-last text-xs">Seguidores</dt>
              <dd className="text-lg font-bold">{profile?.followersCount ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground order-last text-xs">Siguiendo</dt>
              <dd className="text-lg font-bold">{profile?.followingCount ?? "-"}</dd>
            </div>
          </dl>
          {loading ? (
            <p className="text-muted-foreground flex items-center gap-2 py-8 text-center text-sm">
              <LoaderCircle aria-hidden className="size-4 animate-spin" /> Cargando...
            </p>
          ) : posts.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Aun no tienes publicaciones.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1.5">
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
        </>
      ) : null}

      {tab === "respuestas" ? (
        <EmptyTab
          icon={MessageCircle}
          title="Sin respuestas todavia"
          description={`Cuando respondas publicaciones apareceran aqui. @${username}`}
        />
      ) : null}

      {tab === "guardados" ? (
        <EmptyTab
          icon={Bookmark}
          title="Nada guardado aun"
          description="Guarda publicaciones con el marcador para verlas despues."
        />
      ) : null}
    </section>
  );
}

/** Carga el perfil publico del usuario autenticado (contadores incluidos). */
async function getProfile(username: string): Promise<UserProfileResponse> {
  return getJson(`/users/${encodeURIComponent(username)}`, UserProfileResponseSchema);
}

/** Carga la pagina de posts del usuario (cursor-based). */
async function getPosts(
  username: string,
  createdBefore: string | undefined,
): Promise<{ items: PostResponse[]; nextCursor: string | null }> {
  const query = createdBefore
    ? `?limit=20&createdBefore=${encodeURIComponent(createdBefore)}`
    : "?limit=20";
  return getJson(
    `/posts/user/${encodeURIComponent(username)}${query}`,
    PaginatedPostsResponseSchema,
  );
}
