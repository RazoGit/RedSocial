import type { Notification } from "@redsocial/contracts";

/** Texto corto de una notificacion (spec 007 RF-2..RF-4). */
export function notificationText(notification: Notification): string {
  switch (notification.type) {
    case "like":
      return "le gusto tu publicacion";
    case "comment":
      return "comento tu publicacion";
    case "reply":
      return "respondio a tu comentario";
    case "follow":
      return "te siguio";
  }
}

/** Enlace donde lleva la notificacion segun su tipo. */
export function notificationHref(notification: Notification): string {
  if (notification.commentId) return `/post/${notification.postId}#comentario`;
  if (notification.postId) return `/post/${notification.postId}`;
  return `/u/${notification.actor.username}`;
}

/** Tiempo relativo tipo feed ("ahora", "5 min", "3 h", "2 d"). */
export function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d`;
  return new Date(isoDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

/** Nombre visible del actor (displayName ?? username). */
export function actorName(notification: Notification): string {
  return notification.actor.displayName ?? notification.actor.username;
}
