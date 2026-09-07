"use client";

import Link from "next/link";
import { Heart, MailPlus, MessageCircle, Reply, UserPlus } from "lucide-react";

import { UserAvatar } from "@/components/user";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { actorName, notificationHref, notificationText } from "@/lib/notification-helpers";
import type { Notification } from "@redsocial/contracts";

const ICONS = {
  like: Heart,
  comment: MessageCircle,
  reply: Reply,
  follow: UserPlus,
} as const;

export function NotificationIcon({
  type,
  className,
}: {
  type: Notification["type"];
  className?: string;
}) {
  const Icon = ICONS[type];
  return <Icon className={className} />;
}

/**
 * Toast de nueva notificacion (spec 007/T21): aparece cuando llega
 * notification:new y el usuario no esta viendo /notifications.
 */
export function RealtimeToast() {
  const { toast } = useRealtime();
  if (!toast) return null;
  const { notification } = toast;

  return (
    <div className="fixed right-4 bottom-20 z-50 md:right-6 md:bottom-6" role="status">
      <Link
        href={notificationHref(notification)}
        className="border-border bg-background flex items-center gap-3 rounded-2xl border p-3 pr-5 shadow-lg"
      >
        <span className="relative">
          <UserAvatar name={actorName(notification)} className="size-10" />
          <span className="bg-primary text-primary-foreground absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full">
            <NotificationIcon type={notification.type} className="size-3" />
          </span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{actorName(notification)}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {notificationText(notification)}
          </span>
        </span>
        <MailPlus aria-hidden className="text-muted-foreground size-4 shrink-0" />
      </Link>
    </div>
  );
}
