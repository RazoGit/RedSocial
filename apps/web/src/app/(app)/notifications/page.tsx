import { Heart, MessageCircle, UserPlus } from "lucide-react";

import { UserAvatar } from "@/components/user";
import { mockNotifications, userById } from "@/lib/mock-data";

const icons = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
} as const;

const iconStyles = {
  like: "fill-current",
  comment: "",
  follow: "",
} as const;

export default function NotificationsPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="mb-2 text-lg font-semibold">Notificaciones</h1>
      {mockNotifications.map((notification) => {
        const user = userById(notification.userId);
        const Icon = icons[notification.type];
        return (
          <article
            key={notification.id}
            className="border-border bg-card/40 flex items-center gap-3 rounded-xl border p-3"
          >
            <div className="relative">
              <UserAvatar name={user.name} className="size-10" />
              <span className="bg-primary text-primary-foreground absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full">
                <Icon className={`size-3 ${iconStyles[notification.type]}`} />
              </span>
            </div>
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">{user.name}</span>{" "}
              <span className="text-muted-foreground">{notification.text}</span>
            </p>
            {notification.unread ? (
              <span aria-label="No leido" className="bg-primary size-2 shrink-0 rounded-full" />
            ) : null}
            <span className="text-muted-foreground shrink-0 text-xs">{notification.time}</span>
          </article>
        );
      })}
    </div>
  );
}
