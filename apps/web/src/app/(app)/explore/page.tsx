"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { FeedResponseSchema } from "@redsocial/contracts";
import type { PostResponse } from "@redsocial/contracts";

import { getJson } from "@/lib/api-client";

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

export default function ExplorePage() {
  const [posts, setPosts] = useState<PostResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getJson("/feed?limit=20", FeedResponseSchema);
        if (!cancelled) setPosts(data.items);
      } catch {
        // Sin API: grid vacio.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
        <input
          type="search"
          placeholder="Buscar personas, hashtags..."
          aria-label="Buscar"
          className="border-input bg-card/40 focus-visible:border-primary focus-visible:ring-primary/30 h-11 w-full rounded-full border pr-4 pl-10 text-base outline-none md:text-sm focus-visible:ring-2"
        />
      </div>

      <h1 className="sr-only">Explorar</h1>
      {loading ? (
        <p className="text-muted-foreground py-8 text-center text-sm">Cargando...</p>
      ) : posts.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Sigue a personas para ver sus publicaciones aqui.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {posts.map((post) => (
            <PostThumbnail key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
