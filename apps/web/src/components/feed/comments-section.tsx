"use client";

import { useCallback, useEffect, useState } from "react";
import { CornerDownRight, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user";
import {
  createComment,
  deleteComment,
  listComments,
  type CommentResponse,
} from "@/lib/generated/api";

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

interface CommentsSectionProps {
  postId: string;
  isOwner: boolean;
}

export function CommentsSection({ postId, isOwner }: CommentsSectionProps) {
  const [comments, setComments] = useState<CommentResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);

  const fetchComments = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      try {
        const res = await listComments(postId, {
          limit: 20,
          ...(cursor ? { createdBefore: cursor } : {}),
        });
        if ("status" in res && res.status === 200) {
          setComments((prev) => (cursor ? [...prev, ...res.data.items] : res.data.items));
          setTotal(res.data.total);
          setNextCursor(res.data.nextCursor);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    },
    [postId],
  );

  useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const res = await createComment(postId, { text: trimmed });
      if ("status" in res && res.status === 201) {
        setComments((prev) => [res.data, ...prev]);
        setTotal((t) => t + 1);
        setText("");
      }
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment(postId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setTotal((t) => Math.max(0, t - 1));
    } catch {
      // silent
    }
  };

  const handleReply = async (parentId: string) => {
    const trimmed = replyText.trim();
    if (!trimmed || replySubmitting) return;
    setReplySubmitting(true);
    try {
      const res = await createComment(postId, { text: trimmed, parentId });
      if ("status" in res && res.status === 201) {
        setComments((prev) =>
          prev.map((c) => (c.id === parentId ? { ...c, replies: [...c.replies, res.data] } : c)),
        );
        setReplyTo(null);
        setReplyText("");
        setTotal((t) => t + 1);
      }
    } catch {
      // silent
    } finally {
      setReplySubmitting(false);
    }
  };

  return (
    <div className="border-border mt-3 border-t pt-3">
      {total > 0 && (
        <p className="text-muted-foreground mb-2 text-xs font-medium">
          {total} comentario{total !== 1 ? "s" : ""}
        </p>
      )}

      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe un comentario..."
          maxLength={500}
          rows={2}
          className="bg-muted/50 border-border flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-primary"
        />
        <Button
          size="icon"
          variant="ghost"
          disabled={!text.trim() || submitting}
          onClick={handleSubmit}
          aria-label="Enviar comentario"
          className="size-9 shrink-0 self-end"
        >
          <Send className="size-4" />
        </Button>
      </div>

      {comments.length > 0 && (
        <ul className="mt-3 space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex flex-col gap-1">
              <div className="flex gap-2">
                <UserAvatar
                  name={c.author.displayName || c.author.username}
                  className="size-7 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-foreground text-xs font-semibold">
                      {c.author.displayName || c.author.username}
                    </span>
                    <span className="text-muted-foreground text-[10px]">@{c.author.username}</span>
                    <span className="text-muted-foreground text-[10px]">
                      {timeAgo(c.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm leading-snug">{c.text}</p>
                  <div className="mt-0.5 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setReplyTo((prev) => (prev === c.id ? null : c.id))}
                      className="text-muted-foreground text-[10px] hover:text-foreground"
                    >
                      Responder
                    </button>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="text-muted-foreground text-[10px] hover:text-red-500"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {c.replies.length > 0 && (
                <ul className="ml-9 space-y-2 border-l pl-3">
                  {c.replies.map((r) => (
                    <li key={r.id} className="flex gap-2">
                      <UserAvatar
                        name={r.author.displayName || r.author.username}
                        className="size-6 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-foreground text-xs font-semibold">
                            {r.author.displayName || r.author.username}
                          </span>
                          <span className="text-muted-foreground text-[10px]">
                            @{r.author.username}
                          </span>
                          <span className="text-muted-foreground text-[10px]">
                            {timeAgo(r.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm leading-snug">{r.text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {replyTo === c.id && (
                <div className="ml-9 flex items-center gap-2">
                  <CornerDownRight className="text-muted-foreground size-3.5 shrink-0" />
                  <input
                    autoFocus
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleReply(c.id);
                    }}
                    placeholder={`Responder a ${c.author.displayName || c.author.username}...`}
                    maxLength={500}
                    className="bg-muted/50 border-border flex-1 rounded-lg border px-3 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={!replyText.trim() || replySubmitting}
                    onClick={() => handleReply(c.id)}
                    aria-label="Enviar respuesta"
                    className="size-7 shrink-0"
                  >
                    <Send className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setReplyTo(null);
                      setReplyText("");
                    }}
                    aria-label="Cancelar respuesta"
                    className="size-7 shrink-0"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <Button
          variant="ghost"
          size="sm"
          disabled={loading}
          onClick={() => fetchComments(nextCursor)}
          className="mt-2 w-full text-xs"
        >
          {loading ? "Cargando..." : "Ver mas comentarios"}
        </Button>
      )}

      {loading && comments.length === 0 && (
        <p className="text-muted-foreground mt-2 text-xs">Cargando comentarios...</p>
      )}
    </div>
  );
}
