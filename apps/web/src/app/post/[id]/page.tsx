"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Bookmark,
  Heart,
  MessageCircle,
  MoreVertical,
  SendHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { UserAvatar, VerifiedMark } from "@/components/user";
import { coverGradient, postById, userById } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const post = postById(params.id);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!post) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <h1 className="text-lg font-semibold">Publicacion no encontrada</h1>
        <Button variant="outline" size="sm" asChild>
          <Link href="/feed">Volver al inicio</Link>
        </Button>
      </div>
    );
  }

  const author = userById(post.userId);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="icon" asChild className="size-10">
          <Link href="/feed" aria-label="Volver">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <span className="text-sm font-semibold">Publicacion</span>
        <Button variant="ghost" size="icon" aria-label="Mas opciones" className="size-10">
          <MoreVertical className="size-5" />
        </Button>
      </header>

      <article className="border-border bg-card/40 rounded-2xl border p-4">
        <div className="flex items-center gap-3">
          <UserAvatar
            name={author.name}
            className="ring-primary/50 size-11 ring-2 ring-offset-2 ring-offset-background"
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-sm font-semibold">
              <span className="truncate">{author.name}</span>
              {author.verified ? <VerifiedMark /> : null}
            </p>
            <p className="text-muted-foreground text-xs">@{author.handle}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-primary/60 text-primary hover:bg-primary/10 hover:text-primary"
          >
            Seguir
          </Button>
        </div>

        {post.text ? <p className="mt-4 text-sm leading-relaxed">{post.text}</p> : null}
        {post.hashtag ? (
          <p className="text-primary mt-2 text-sm font-medium">{post.hashtag}</p>
        ) : null}

        <div className="border-border relative mt-4 aspect-[4/5] overflow-hidden rounded-xl border">
          <div className="absolute inset-0" style={{ backgroundImage: coverGradient(post.hue) }} />
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center font-bold tracking-tighter select-none"
          >
            <span className="text-primary/15 text-9xl">R</span>
          </span>
        </div>

        <div className="mt-4 flex items-center gap-5">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={liked}
            aria-label="Me gusta"
            onClick={() => setLiked((value) => !value)}
            className={cn("gap-1.5", liked ? "text-primary" : "text-muted-foreground")}
          >
            <Heart className={cn("size-5", liked && "fill-current")} />
            <span className="text-xs">{post.likes + (liked ? 1 : 0)}</span>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5">
            <MessageCircle className="size-5" />
            <span className="text-xs">{post.comments}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={saved}
            aria-label="Guardar"
            onClick={() => setSaved((value) => !value)}
            className={cn("gap-1.5", saved ? "text-primary" : "text-muted-foreground")}
          >
            <Bookmark className={cn("size-5", saved && "fill-current")} />
          </Button>
        </div>
      </article>

      <form className="flex items-center gap-2" onSubmit={(event) => event.preventDefault()}>
        <input
          type="text"
          placeholder="Escribe un comentario..."
          aria-label="Escribe un comentario"
          className="border-input bg-card/40 focus-visible:border-primary focus-visible:ring-primary/30 text-base md:text-sm h-11 flex-1 rounded-full border px-4 outline-none focus-visible:ring-2"
        />
        <Button type="submit" size="icon" className="rounded-full" aria-label="Enviar comentario">
          <SendHorizontal className="size-4" />
        </Button>
      </form>
    </div>
  );
}
