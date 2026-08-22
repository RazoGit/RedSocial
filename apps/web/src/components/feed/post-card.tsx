"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Repeat2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UserAvatar, VerifiedMark } from "@/components/user";
import { coverGradient, userById, type MockPost } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

function formatCount(value: number): string {
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(1).replace(".0", "")} k`;
}

interface PostCardProps {
  post: MockPost;
}

export function PostCard({ post }: PostCardProps) {
  const author = userById(post.userId);
  const [liked, setLiked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <article className="border-border bg-card/40 rounded-2xl border p-4 transition-colors hover:border-primary/30">
      <div className="flex items-center gap-3">
        <UserAvatar
          name={author.name}
          className="ring-primary/50 size-10 ring-2 ring-offset-2 ring-offset-background"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-sm font-semibold">
            <span className="truncate">{author.name}</span>
            {author.verified ? <VerifiedMark /> : null}
          </p>
          <p className="text-muted-foreground text-xs">
            @{author.handle} · {post.time}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Mas opciones">
          <MoreHorizontal className="size-5" />
        </Button>
      </div>

      {post.text ? <p className="mt-3 text-sm leading-relaxed">{post.text}</p> : null}
      {post.hashtag ? (
        <p className="text-primary mt-3 text-sm font-medium">{post.hashtag}</p>
      ) : null}

      <Link
        href={`/post/${post.id}`}
        aria-label={`Ver publicacion de ${author.name}`}
        className="border-border relative mt-3 block aspect-[4/3] overflow-hidden rounded-xl border"
      >
        <div className="absolute inset-0" style={{ backgroundImage: coverGradient(post.hue) }} />
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center font-bold tracking-tighter select-none"
        >
          <span className="text-primary/15 text-8xl">R</span>
        </span>
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={liked}
          aria-label="Me gusta"
          onClick={() => setLiked((value) => !value)}
          className={cn("gap-1.5", liked ? "text-primary" : "text-muted-foreground")}
        >
          <Heart className={cn("size-4", liked && "fill-current")} />
          <span className="text-xs">{formatCount(post.likes + (liked ? 1 : 0))}</span>
        </Button>
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground gap-1.5">
          <Link href={`/post/${post.id}`} aria-label="Comentarios">
            <MessageCircle className="size-4" />
            <span className="text-xs">{formatCount(post.comments)}</span>
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={reposted}
          aria-label="Republicar"
          onClick={() => setReposted((value) => !value)}
          className={cn("gap-1.5", reposted ? "text-primary" : "text-muted-foreground")}
        >
          <Repeat2 className="size-4" />
          <span className="text-xs">{formatCount(post.reposts + (reposted ? 1 : 0))}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={saved}
          aria-label="Guardar"
          onClick={() => setSaved((value) => !value)}
          className={cn("gap-1.5", saved ? "text-primary" : "text-muted-foreground")}
        >
          <Bookmark className={cn("size-4", saved && "fill-current")} />
        </Button>
      </div>
    </article>
  );
}
