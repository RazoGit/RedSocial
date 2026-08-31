"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Repeat2 } from "lucide-react";
import type { PostResponse } from "@redsocial/contracts";

import { Button } from "@/components/ui/button";
import { UserAvatar, VerifiedMark } from "@/components/user";
import { likePost, unlikePost } from "@/lib/generated/api";
import { coverGradient, userById, type MockPost } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { CommentsSection } from "./comments-section";

function formatCount(value: number): string {
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(1).replace(".0", "")} k`;
}

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

/** PostCard acepta MockPost (datos mock) o PostResponse (API real). */
interface PostCardProps {
  post: MockPost | PostResponse;
}

function isRealPost(post: MockPost | PostResponse): post is PostResponse {
  return "author" in post && typeof (post as PostResponse).author === "object";
}

export function PostCard({ post }: PostCardProps) {
  const [liked, setLiked] = useState<boolean>(isRealPost(post) ? (post.isLiked ?? false) : false);
  const [likesCount, setLikesCount] = useState<number>(isRealPost(post) ? post.likesCount : 0);
  const [reposted, setReposted] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [likePending, setLikePending] = useState<boolean>(false);
  const [showComments, setShowComments] = useState<boolean>(false);
  const [commentsCount, setCommentsCount] = useState<number>(
    isRealPost(post) ? post.commentsCount : 0,
  );

  const handleLike = useCallback(async () => {
    if (!isRealPost(post) || likePending) return;
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
  }, [post, liked, likesCount, likePending]);

  if (isRealPost(post)) {
    return (
      <RealPostCard
        post={post}
        liked={liked}
        setLiked={setLiked}
        likesCount={likesCount}
        handleLike={handleLike}
        reposted={reposted}
        setReposted={setReposted}
        saved={saved}
        setSaved={setSaved}
        showComments={showComments}
        setShowComments={setShowComments}
        commentsCount={commentsCount}
        setCommentsCount={setCommentsCount}
      />
    );
  }
  return (
    <MockPostCard
      post={post}
      liked={liked}
      setLiked={setLiked}
      likesCount={likesCount}
      reposted={reposted}
      setReposted={setReposted}
      saved={saved}
      setSaved={setSaved}
    />
  );
}

interface SharedActionsProps {
  liked: boolean;
  setLiked: (fn: (v: boolean) => boolean) => void;
  likesCount: number;
  handleLike?: () => void;
  reposted: boolean;
  setReposted: (fn: (v: boolean) => boolean) => void;
  saved: boolean;
  setSaved: (fn: (v: boolean) => boolean) => void;
  postId: string;
  showComments?: boolean;
  setShowComments?: React.Dispatch<React.SetStateAction<boolean>>;
  commentsCount?: number;
  setCommentsCount?: React.Dispatch<React.SetStateAction<number>>;
}

function ActionBar({
  liked,
  setLiked,
  likesCount,
  handleLike,
  reposted,
  setReposted,
  saved,
  setSaved,
  showComments,
  setShowComments,
  commentsCount,
}: SharedActionsProps) {
  const onLikeClick = handleLike ?? (() => setLiked((v) => !v));
  return (
    <div className="mt-3 flex items-center justify-between">
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={liked}
        aria-label="Me gusta"
        onClick={onLikeClick}
        className={cn("gap-1.5", liked ? "text-primary" : "text-muted-foreground")}
      >
        <Heart className={cn("size-4", liked && "fill-current")} />
        {likesCount > 0 && <span className="text-xs">{formatCount(likesCount)}</span>}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={showComments}
        aria-label="Comentarios"
        onClick={() => setShowComments?.((v) => !v)}
        className={cn("gap-1.5", showComments ? "text-primary" : "text-muted-foreground")}
      >
        <MessageCircle className="size-4" />
        {(commentsCount ?? 0) > 0 && <span className="text-xs">{formatCount(commentsCount!)}</span>}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={reposted}
        aria-label="Republicar"
        onClick={() => setReposted((v) => !v)}
        className={cn("gap-1.5", reposted ? "text-primary" : "text-muted-foreground")}
      >
        <Repeat2 className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={saved}
        aria-label="Guardar"
        onClick={() => setSaved((v) => !v)}
        className={cn("gap-1.5", saved ? "text-primary" : "text-muted-foreground")}
      >
        <Bookmark className={cn("size-4", saved && "fill-current")} />
      </Button>
    </div>
  );
}

interface CardProps extends SharedActionsProps {
  children: React.ReactNode;
  isReal?: boolean;
}

function Card({
  postId,
  children,
  isReal,
  showComments,
  setShowComments,
  commentsCount,
  ...actions
}: CardProps) {
  return (
    <article className="border-border bg-card/40 rounded-2xl border p-4 transition-colors hover:border-primary/30">
      {children}
      <ActionBar
        postId={postId}
        showComments={showComments}
        setShowComments={setShowComments}
        commentsCount={commentsCount}
        {...actions}
      />
      {isReal && showComments && <CommentsSection postId={postId} isOwner={false} />}
    </article>
  );
}

function RealPostCard({
  post,
  liked,
  setLiked,
  likesCount,
  handleLike,
  reposted,
  setReposted,
  saved,
  setSaved,
  showComments,
  setShowComments,
  commentsCount,
  setCommentsCount,
}: { post: PostResponse } & Omit<SharedActionsProps, "postId">) {
  return (
    <Card
      postId={post.id}
      isReal
      liked={liked}
      setLiked={setLiked}
      likesCount={likesCount}
      handleLike={handleLike}
      reposted={reposted}
      setReposted={setReposted}
      saved={saved}
      setSaved={setSaved}
      showComments={showComments}
      setShowComments={setShowComments}
      commentsCount={commentsCount}
      setCommentsCount={setCommentsCount}
    >
      <div className="flex items-center gap-3">
        <Link href={`/u/${post.author.username}`}>
          <UserAvatar
            name={post.author.displayName || post.author.username}
            className="ring-primary/50 size-10 ring-2 ring-offset-2 ring-offset-background"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-sm font-semibold">
            <span className="truncate">{post.author.displayName || post.author.username}</span>
          </p>
          <p className="text-muted-foreground text-xs">
            @{post.author.username} · {timeAgo(post.createdAt)}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Mas opciones" className="size-10">
          <MoreHorizontal className="size-5" />
        </Button>
      </div>
      {post.text ? <p className="mt-3 text-sm leading-relaxed">{post.text}</p> : null}
      {post.media.length > 0 ? (
        <Link
          href={`/post/${post.id}`}
          aria-label={`Ver publicacion de ${post.author.username}`}
          className="border-border bg-muted relative mt-3 block aspect-[4/3] overflow-hidden rounded-xl border"
        >
          <span className="text-muted-foreground absolute inset-0 flex items-center justify-center text-xs">
            Imagen
          </span>
        </Link>
      ) : null}
    </Card>
  );
}

function MockPostCard({
  post,
  liked,
  setLiked,
  likesCount,
  reposted,
  setReposted,
  saved,
  setSaved,
}: { post: MockPost } & Omit<SharedActionsProps, "postId">) {
  const author = userById(post.userId);
  return (
    <Card
      postId={post.id}
      liked={liked}
      setLiked={setLiked}
      likesCount={likesCount}
      reposted={reposted}
      setReposted={setReposted}
      saved={saved}
      setSaved={setSaved}
    >
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
        <Button variant="ghost" size="icon" aria-label="Mas opciones" className="size-10">
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
    </Card>
  );
}
