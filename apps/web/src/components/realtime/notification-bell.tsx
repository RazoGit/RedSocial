"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { NotificationIcon } from "@/components/realtime/realtime-toast";
import { actorName, notificationText } from "@/lib/notification-helpers";
import { cn } from "@/lib/utils";

function formatBadge(count: number): string {
  if (count <= 0) return "";
  return count > 99 ? "99+" : String(count);
}

/**
 * Badge numerico de no leidas (spec 007/T19) para navLinks estaticos.
 */
export function UnreadBadge({ className }: { className?: string }) {
  const { unreadCount } = useRealtime();
  const label = formatBadge(unreadCount);
  if (!label) return null;
  return (
    <span
      aria-label="Notificaciones no leidas"
      className={cn(
        "bg-primary text-primary-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold",
        className,
      )}
    >
      {label}
    </span>
  );
}

/**
 * Campana con dropdown de las ultimas notificaciones (spec 007/T19).
 */
export function NotificationBell() {
  const { unreadCount, notifications, markAllRead, connected } = useRealtime();
  const [open, setOpen] = useState(false);

  const recent = notifications.slice(0, 6);
  const label = formatBadge(unreadCount);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative size-10"
        aria-label={`Notificaciones${label ? ` (${label} sin leer)` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="size-5" />
        {label ? (
          <span className="bg-primary text-primary-foreground absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
            {label}
          </span>
        ) : null}
      </Button>

      {open ? (
        <>
          <button
            aria-label="Cerrar"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="border-border bg-background absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <p className="text-sm font-semibold">Notificaciones</p>
              {unreadCount > 0 ? (
                <button
                  onClick={() => void markAllRead()}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium"
                >
                  <CheckCheck className="size-3.5" /> Marcar todo leido
                </button>
              ) : null}
            </div>

            {recent.length === 0 ? (
              <p className="text-muted-foreground px-4 py-8 text-center text-sm">
                {connected ? "Sin notificaciones aun." : "Conectando..."}
              </p>
            ) : (
              <ul className="max-h-80 overflow-y-auto py-1">
                {recent.map((notification) => (
                  <li key={notification.id}>
                    <Link
                      href={`/notifications`}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/60",
                        !notification.read && "bg-primary/5",
                      )}
                    >
                      <span className="relative">
                        <UserAvatar name={actorName(notification)} className="size-9" />
                        <span className="bg-primary text-primary-foreground absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full">
                          <NotificationIcon type={notification.type} className="size-2.5" />
                        </span>
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-semibold">{actorName(notification)}</span>{" "}
                        <span className="text-muted-foreground">
                          {notificationText(notification)}
                        </span>
                      </span>
                      {!notification.read ? (
                        <span
                          aria-label="No leido"
                          className="bg-primary size-2 shrink-0 rounded-full"
                        />
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-border p-2">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setOpen(false)}
              >
                <Link href="/notifications">Ver todas</Link>
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
