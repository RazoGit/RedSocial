import Link from "next/link";
import { Search } from "lucide-react";

import { coverGradient, mockPosts } from "@/lib/mock-data";

export default function ExplorePage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
        <input
          type="search"
          placeholder="Buscar personas, hashtags..."
          aria-label="Buscar"
          className="border-input bg-card/40 focus-visible:border-primary focus-visible:ring-primary/30 h-11 w-full rounded-full border pr-4 pl-10 text-sm outline-none focus-visible:ring-2"
        />
      </div>

      <h1 className="sr-only">Explorar</h1>
      <div className="grid grid-cols-3 gap-1.5">
        {mockPosts.map((post) => (
          <Link
            key={post.id}
            href={`/post/${post.id}`}
            aria-label={`Publicacion de ${post.hashtag ?? "usuario"}`}
            className="border-border relative aspect-square overflow-hidden rounded-lg border transition-opacity hover:opacity-80"
          >
            <div
              className="absolute inset-0"
              style={{ backgroundImage: coverGradient(post.hue) }}
            />
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center select-none"
            >
              <span className="text-primary/20 text-5xl font-bold">R</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
