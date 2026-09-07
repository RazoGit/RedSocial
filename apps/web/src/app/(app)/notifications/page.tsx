"use client";

import { useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type { Notification } from "@redsocial/contracts";
import { CheckCheck, LoaderCircle } from "lucide-react";

import { UserAvatar } from "@/components/user";
import { NotificationIcon } from "@/components/realtime/realtime-toast";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { actorName, notificationHref, notificationText, timeAgo } from "@/lib/notification-helpers";
import { cn } from "@/lib/utils";

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: Notification;
  onOpen: (id: string) => void;
}) {
  return (
    <Link
      href={notificationHref(notification)}
      onClick={() => onOpen(notification.id)}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card/40 p-3 transition-colors hover:bg-card/70",
        !notification.read && "bg-primary/5",
      )}
    >
      <span className="relative shrink-0">
        <UserAvatar name={actorName(notification)} className="size-10" />
        <span className="bg-primary text-primary-foreground absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full">
          <NotificationIcon type={notification.type} className="size-3" />
        </span>
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{actorName(notification)}</span>{" "}
        <span className="text-muted-foreground">{notificationText(notification)}</span>
        <span className="text-muted-foreground mt-0.5 block text-xs">
          {timeAgo(notification.createdAt)}
        </span>
      </span>
      {!notification.read ? (
        <span aria-label="No leido" className="bg-primary size-2 shrink-0 rounded-full" />
      ) : null}
    </Link>
  );
}

/**
 * Pagina /notifications (spec 007/T20): lista paginada reutilizando el
 * RealtimeProvider, con scroll infinito (IntersectionObserver), texto por
 * tipo, enlace al post/comentario y tiempo relativo.
 */
export default function NotificationsPage() {
  const { unreadCount, notifications, hasMore, loadingOlder, loadOlder, markAllRead, markRead } =
    useRealtime();

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !loadingOlder) {
          void loadOlder();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingOlder, loadOlder]);

  const handleOpen = useCallback(
    (id: string) => {
      void markRead(id);
    },
    [markRead],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Notificaciones</h1>
        {unreadCount > 0 ? (
          <button
            onClick={() => void markAllRead()}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium"
          >
            <CheckCheck className="size-3.5" /> Marcar todo leido
          </button>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">Sin notificaciones aun.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <NotificationRow notification={notification} onOpen={handleOpen} />
              </li>
            ))}
          </ul>

          <div ref={sentinelRef} className="flex justify-center py-4">
            {loadingOlder ? (
              <LoaderCircle aria-hidden className="text-muted-foreground size-5 animate-spin" />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
