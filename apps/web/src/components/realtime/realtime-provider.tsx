"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { z } from "zod";

import {
  NotificationNewEventSchema,
  NotificationsResponseSchema,
  PresenceChangeEventSchema,
  UnreadCountResponseSchema,
  type Notification,
} from "@redsocial/contracts";
import type { Socket } from "socket.io-client";

import { getAuthSession } from "@/lib/auth-session";
import { getJson, patchJson, postJson } from "@/lib/api-client";
import { connectRealtime } from "@/lib/socket";

/** Eventos WS server->cliente que usa el cliente de la web. */
const UnreadEventSchema = z.object({ unreadCount: z.number().int().min(0) });

interface RealtimeContextValue {
  connected: boolean;
  unreadCount: number;
  notifications: Notification[];
  hasMore: boolean;
  loadingOlder: boolean;
  loadOlder: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  toast: { notification: Notification; key: number } | null;
  presence: Record<string, boolean>;
  watchPresence: (userIds: string[]) => void;
  unwatchPresence: (userIds: string[]) => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const LIST_LIMIT = 20;

/**
 * RealtimeProvider (spec 007/T18): conecta el socket autenticado, mantiene el
 * badge de no leidas y la cola de notificaciones, y gestiona presencia entre
 * usuarios del mismo despliegue. Los toasts se muestran con <RealtimeToast />.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const socketRef = useRef<Socket | null>(null);
  const watchedRef = useRef<Set<string>>(new Set());
  const restLoadedRef = useRef(false);

  const [connected, setConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [toast, setToast] = useState<RealtimeContextValue["toast"]>(null);
  const [presence, setPresence] = useState<Record<string, boolean>>({});

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (notification: Notification) => {
      if (pathname === "/notifications") return;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({ notification, key: Date.now() });
      toastTimerRef.current = setTimeout(() => setToast(null), 4_000);
    },
    [pathname],
  );

  /** Re-emite presence:watch para todos los ids registrados. */
  const syncWatched = useCallback((socket: Socket) => {
    const ids = [...watchedRef.current];
    if (ids.length === 0) return;
    socket.emit("presence:watch", { userIds: ids }, (res: { online?: Record<string, boolean> }) => {
      if (res?.online) {
        setPresence((prev) => ({ ...prev, ...res.online }));
      }
    });
  }, []);

  /** Pagina inicial + unreadCount via REST. */
  const fetchInitial = useCallback(async () => {
    try {
      const [list, unread] = await Promise.all([
        getJson("/notifications?limit=20", NotificationsResponseSchema),
        getJson("/notifications/unread-count", UnreadCountResponseSchema),
      ]);
      restLoadedRef.current = true;
      setNotifications(list.items);
      setNextCursor(list.nextCursor);
      setUnreadCount(unread.unreadCount);
    } catch {
      // Sin API: el socket emitira notifications:initial si conecta.
    }
  }, []);

  useEffect(() => {
    const session = getAuthSession();
    if (!session) return;

    void fetchInitial();

    const socket = connectRealtime(session.accessToken);
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      syncWatched(socket);
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on("notifications:initial", (payload: unknown) => {
      const parsed = UnreadEventSchema.safeParse(payload);
      // El snapshot del socket solo vale si el REST inicial no llego antes.
      if (parsed.success && !restLoadedRef.current) {
        setUnreadCount(parsed.data.unreadCount);
      }
    });

    socket.on("notification:new", (payload: unknown) => {
      const parsed = NotificationNewEventSchema.safeParse(payload);
      if (!parsed.success) return;
      const { notification, unreadCount: count } = parsed.data;
      setNotifications((prev) => [notification, ...prev.filter((n) => n.id !== notification.id)]);
      setUnreadCount(count);
      showToast(notification);
    });

    socket.on("notifications:unread", (payload: unknown) => {
      const parsed = UnreadEventSchema.safeParse(payload);
      if (parsed.success) setUnreadCount(parsed.data.unreadCount);
    });

    socket.on("presence:change", (payload: unknown) => {
      const parsed = PresenceChangeEventSchema.safeParse(payload);
      if (!parsed.success) return;
      const { userId, online } = parsed.data;
      setPresence((prev) => ({ ...prev, [userId]: online }));
    });

    return () => {
      socket.off("notifications:initial");
      socket.off("notification:new");
      socket.off("notifications:unread");
      socket.off("presence:change");
      socket.off("connect");
      socket.off("disconnect");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await patchJson(`/notifications/${id}/read`, {}, z.void());
    } catch {
      // Revertir localmente
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: false } : n)));
      setUnreadCount((prev) => prev + 1);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await postJson("/notifications/read-all", {}, z.void());
    } catch {
      void fetchInitial();
    }
  }, [fetchInitial]);

  const loadOlder = useCallback(async () => {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const data = await getJson(
        `/notifications?limit=${LIST_LIMIT}&createdBefore=${encodeURIComponent(nextCursor)}`,
        NotificationsResponseSchema,
      );
      setNotifications((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch {
      // Silencioso
    } finally {
      setLoadingOlder(false);
    }
  }, [nextCursor, loadingOlder]);

  const watchPresence = useCallback((userIds: string[]) => {
    const fresh = userIds.filter((id) => !watchedRef.current.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => watchedRef.current.add(id));
    if (socketRef.current?.connected) {
      socketRef.current.emit(
        "presence:watch",
        { userIds: fresh },
        (res: { online?: Record<string, boolean> }) => {
          if (res?.online) setPresence((prev) => ({ ...prev, ...res.online }));
        },
      );
    }
  }, []);

  const unwatchPresence = useCallback((userIds: string[]) => {
    userIds.forEach((id) => watchedRef.current.delete(id));
    if (socketRef.current?.connected) {
      socketRef.current.emit("presence:unwatch", { userIds });
    }
  }, []);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      connected,
      unreadCount,
      notifications,
      hasMore: nextCursor !== null,
      loadingOlder,
      loadOlder,
      markRead,
      markAllRead,
      toast,
      presence,
      watchPresence,
      unwatchPresence,
    }),
    [
      connected,
      unreadCount,
      notifications,
      nextCursor,
      loadingOlder,
      loadOlder,
      markRead,
      markAllRead,
      toast,
      presence,
      watchPresence,
      unwatchPresence,
    ],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error("useRealtime debe usarse dentro de <RealtimeProvider>");
  }
  return context;
}

/** Hook para apuntar presencia de un usuario y saber si esta online. */
export function usePresence(userId: string | undefined): boolean {
  const { presence, watchPresence, unwatchPresence } = useRealtime();

  useEffect(() => {
    if (!userId) return;
    watchPresence([userId]);
    return () => unwatchPresence([userId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return userId !== undefined && presence[userId] === true;
}
