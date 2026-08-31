"use client";

import { useEffect, useState, useCallback } from "react";
import { FeedResponseSchema } from "@redsocial/contracts";
import type { PostResponse } from "@redsocial/contracts";
import { LoaderCircle } from "lucide-react";

import { PostCard } from "@/components/feed/post-card";
import { Button } from "@/components/ui/button";
import { getJson } from "@/lib/api-client";

interface FeedListProps {
  /** Si es true, solo muestra posts de usuarios seguidos. */
  followingOnly?: boolean;
}

/**
 * Lista de posts que consume el feed real de la API (/api/v1/feed).
 * Cursor-based con "Cargar más".
 */
export function FeedList({ followingOnly = false }: FeedListProps) {
  const [posts, setPosts] = useState<PostResponse[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getJson("/feed?limit=20", FeedResponseSchema);
        if (!cancelled) {
          setPosts(data.items);
          setNextCursor(data.nextCursor);
        }
      } catch {
        if (!cancelled) setError("No se pudo cargar el feed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await getJson(
        `/feed?limit=20&createdBefore=${encodeURIComponent(nextCursor)}`,
        FeedResponseSchema,
      );
      setPosts((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch {
      // Silencioso
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  if (loading) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 py-8 text-center text-sm">
        <LoaderCircle aria-hidden className="size-4 animate-spin" /> Cargando feed...
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-muted-foreground py-8 text-center text-sm">
        {error}
      </p>
    );
  }

  if (posts.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {followingOnly
          ? "Siguiendo a nadie aun. Busca personas para seguir."
          : "Tu feed esta vacio. Crea tu primer post o sigue a alguien."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {nextCursor && (
        <div className="flex justify-center py-2">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Cargando..." : "Cargar mas"}
          </Button>
        </div>
      )}
    </div>
  );
}
