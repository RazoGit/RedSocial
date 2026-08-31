"use client";

import { useState } from "react";
import { FollowResponseSchema } from "@redsocial/contracts";
import { LoaderCircle, UserPlus, UserMinus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteJson, postJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface FollowButtonProps {
  username: string;
  initialFollowing?: boolean;
  onToggle?: (following: boolean) => void;
}

export function FollowButton({ username, initialFollowing = false, onToggle }: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    try {
      if (following) {
        const res = await deleteJson(
          `/users/${encodeURIComponent(username)}/follow`,
          FollowResponseSchema,
        );
        setFollowing(res.following);
        onToggle?.(res.following);
      } else {
        const res = await postJson(
          `/users/${encodeURIComponent(username)}/follow`,
          {},
          FollowResponseSchema,
        );
        setFollowing(res.following);
        onToggle?.(res.following);
      }
    } catch {
      // Silencioso: el estado no cambia
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant={following ? "outline" : "default"}
      size="sm"
      onClick={toggle}
      disabled={loading}
      aria-label={following ? `Dejar de seguir a ${username}` : `Seguir a ${username}`}
      className={cn(
        "gap-1.5 transition-colors",
        following
          ? "border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive"
          : "bg-primary text-primary-foreground",
      )}
    >
      {loading ? (
        <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
      ) : following ? (
        <UserMinus aria-hidden className="size-3.5" />
      ) : (
        <UserPlus aria-hidden className="size-3.5" />
      )}
      <span className="text-xs">{loading ? "" : following ? "Siguiendo" : "Seguir"}</span>
    </Button>
  );
}
