"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bookmark,
  Heart,
  MessageCircle,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import type { PostResponse } from "@redsocial/contracts";
import { PostResponseSchema } from "@redsocial/contracts";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user";
import { CommentsSection } from "@/components/feed/comments-section";
import { ApiError, getJson, patchJson } from "@/lib/api-client";
import { likePost, unlikePost } from "@/lib/generated/api";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<PostResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [likePending, setLikePending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getJson(`/posts/${params.id}`, PostResponseSchema);
        if (!cancelled) {
          setPost(data);
          setLiked(data.isLiked ?? false);
          setLikesCount(data.likesCount);
        }
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof ApiError && caught.statusCode === 404
            ? "Publicacion no encontrada."
            : "No se pudo cargar la publicacion.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loading) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <LoaderCircle aria-hidden className="size-4 animate-spin" /> Cargando...
      </p>
    );
  }

  if (error || !post) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <h1 className="text-lg font-semibold">{error ?? "Publicacion no encontrada"}</h1>
        <Button variant="outline" size="sm" asChild>
          <Link href="/feed">Volver al inicio</Link>
        </Button>
      </div>
    );
  }

  const isOwner = post.author.username === localStorage.getItem("username");

  const handleSaveEdit = async () => {
    if (!editText.trim() || editText.length > 500) return;
    setSaving(true);
    try {
      const updated = await patchJson(`/posts/${post.id}`, { text: editText }, PostResponseSchema);
      setPost(updated);
      setEditing(false);
    } catch {
      setError("No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const handleLike = async () => {
    if (likePending) return;
    const prevLiked = liked;
    const prevCount = likesCount;
    const nextLiked = !prevLiked;
    const nextCount = nextLiked ? prevCount + 1 : prevCount - 1;
    setLiked(nextLiked);
    setLikesCount(nextCount);
    setLikePending(true);
    try {
      const res = nextLiked ? await likePost(post.id) : await unlikePost(post.id);
      if ("status" in res && res.status === 200) {
        setLiked(res.data.liked);
        setLikesCount(res.data.likesCount);
      }
    } catch {
      setLiked(prevLiked);
      setLikesCount(prevCount);
    } finally {
      setLikePending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="icon" asChild className="size-10">
          <Link href="/feed" aria-label="Volver">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <span className="text-sm font-semibold">Publicacion</span>
        {isOwner ? (
          <Button variant="ghost" size="icon" aria-label="Mas opciones" className="size-10">
            <MoreVertical className="size-5" />
          </Button>
        ) : (
          <div className="size-10" />
        )}
      </header>

      <article className="border-border bg-card/40 rounded-2xl border p-4">
        <div className="flex items-center gap-3">
          <UserAvatar
            name={post.author.displayName || post.author.username}
            className="ring-primary/50 size-11 ring-2 ring-offset-2 ring-offset-background"
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-sm font-semibold">
              <span className="truncate">{post.author.displayName || post.author.username}</span>
            </p>
            <p className="text-muted-foreground text-xs">@{post.author.username}</p>
          </div>
        </div>

        {editing ? (
          <div className="mt-4 flex flex-col gap-2">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              maxLength={500}
              className="border-input bg-card/40 focus-visible:border-primary focus-visible:ring-primary/30 min-h-[80px] w-full rounded-lg border p-3 text-sm outline-none focus-visible:ring-2"
            />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">{editText.length}/500</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={saving || !editText.trim()}>
                  {saving ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </div>
          </div>
        ) : post.text ? (
          <p className="mt-4 text-sm leading-relaxed">{post.text}</p>
        ) : null}

        {post.media.length > 0 && (
          <div className="mt-4 grid gap-2">
            {post.media.map((m, i) => (
              <div
                key={i}
                className="border-border relative aspect-[4/3] overflow-hidden rounded-xl border"
              >
                {m.blurhash ? (
                  <div
                    className="absolute inset-0"
                    style={{ backgroundColor: `rgba(128,128,128,0.2)` }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-muted" />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <div className="text-muted-foreground text-xs">{formatDate(post.createdAt)}</div>
          {isOwner && !editing && (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Editar"
                onClick={() => {
                  setEditText(post.text || "");
                  setEditing(true);
                }}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive size-8"
                aria-label="Eliminar"
                onClick={async () => {
                  if (!confirm("Seguro que quieres eliminar esta publicacion?")) return;
                  try {
                    await fetch(`/api/v1/posts/${post.id}`, {
                      method: "DELETE",
                      credentials: "same-origin",
                    });
                    router.push("/feed");
                  } catch {
                    setError("No se pudo eliminar.");
                  }
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="border-border mt-4 flex items-center gap-5 border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={liked}
            aria-label="Me gusta"
            onClick={handleLike}
            className={cn("gap-1.5", liked ? "text-primary" : "text-muted-foreground")}
          >
            <Heart className={cn("size-5", liked && "fill-current")} />
            {likesCount > 0 && <span className="text-sm">{likesCount}</span>}
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5">
            <MessageCircle className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={saved}
            aria-label="Guardar"
            onClick={() => setSaved((v) => !v)}
            className={cn("gap-1.5", saved ? "text-primary" : "text-muted-foreground")}
          >
            <Bookmark className={cn("size-5", saved && "fill-current")} />
          </Button>
        </div>
      </article>

      <CommentsSection postId={post.id} isOwner={isOwner} />
    </div>
  );
}
