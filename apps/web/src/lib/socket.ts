"use client";

import { io, type Socket } from "socket.io-client";

/**
 * Socket.IO singleton para el RealtimeProvider (spec 007, T18).
 * Una unica instancia por pestana; se recrea si el token cambia (login/logout).
 */

let liveSocket: Socket | null = null;
let liveToken: string | null = null;

/** URL del servidor Socket.IO (misma API de Nest). */
export function socketBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) return process.env.NEXT_PUBLIC_SOCKET_URL;
  if (process.env.NODE_ENV === "production") {
    return typeof window !== "undefined" ? window.location.origin : "";
  }
  return "http://localhost:4000";
}

/** Conecta (o reutiliza) el socket con el access token actual. */
export function connectRealtime(token: string): Socket {
  if (liveSocket && liveToken === token && liveSocket.connected) {
    return liveSocket;
  }
  disconnectRealtime();
  liveToken = token;
  liveSocket = io(socketBaseUrl(), {
    auth: (cb) => cb({ token }),
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
  });
  return liveSocket;
}

export function disconnectRealtime(): void {
  liveSocket?.disconnect();
  liveSocket = null;
  liveToken = null;
}
