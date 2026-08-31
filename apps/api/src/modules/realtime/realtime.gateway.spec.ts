import { describe, expect, it, vi } from "vitest";

import type { Server, Socket } from "socket.io";

import { TokensService } from "../auth/tokens.service";
import { PresenceService } from "../presence/presence.service";
import { RealtimeGateway, userRoom, presenceRoom } from "./realtime.gateway";

function fakeServer() {
  let middleware: ((socket: Socket, next: (err?: Error) => void) => void) | null = null;
  const server = {
    use: vi.fn((fn: (socket: Socket, next: (err?: Error) => void) => void) => {
      middleware = fn;
    }),
    to: vi.fn().mockReturnValue({
      emit: vi.fn(),
    }),
    _middleware: () => middleware,
  };
  return server as unknown as Server & { _middleware: () => typeof middleware };
}

function fakeSocket(overrides: Partial<Socket> = {}) {
  const socket = {
    data: {},
    handshake: { auth: {} },
    rooms: new Set(),
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn(),
    disconnect: vi.fn(),
    ...overrides,
  } as unknown as Socket;
  return socket;
}

function buildGateway() {
  const tokens = new TokensService();
  const presence = new PresenceService(null);
  const prisma = {
    notification: { count: vi.fn().mockResolvedValue(3) },
  } as unknown as ConstructorParameters<typeof RealtimeGateway>[2];
  const gateway = new RealtimeGateway(tokens, presence, prisma);
  return { gateway, tokens, presence, prisma };
}

describe("RealtimeGateway", () => {
  it("userRoom y presenceRoom derivan claves estables", () => {
    expect(userRoom("abc")).toBe("user:abc");
    expect(presenceRoom("abc")).toBe("presence:abc");
  });

  it("handshake acepta un access token valido", async () => {
    const { gateway, tokens } = buildGateway();
    const server = fakeServer();
    gateway.afterInit(server);
    const middleware = server._middleware();
    expect(middleware).toBeTypeOf("function");

    const socket = fakeSocket();
    socket.handshake.auth = { token: await tokens.signAccessToken({ sub: "u1" }) };
    const next = vi.fn();
    await middleware!(socket, next);
    expect(next).toHaveBeenCalledWith();
    expect((socket.data as { userId: string }).userId).toBe("u1");
  });

  it("handshake rechaza sin token", async () => {
    const { gateway } = buildGateway();
    const server = fakeServer();
    gateway.afterInit(server);
    const middleware = server._middleware();
    const socket = fakeSocket();
    socket.handshake.auth = {};
    const next = vi.fn();
    await middleware!(socket, next);
    expect(next).toHaveBeenCalledWith(new Error("unauthorized"));
  });

  it("handshake rechaza token invalido", async () => {
    const { gateway } = buildGateway();
    const server = fakeServer();
    gateway.afterInit(server);
    const middleware = server._middleware();
    const socket = fakeSocket();
    socket.handshake.auth = { token: "token-falso" };
    const next = vi.fn();
    await middleware!(socket, next);
    expect(next).toHaveBeenCalledWith(new Error("unauthorized"));
  });

  it("handleConnection une a user:{id}, marca online y emite notifications:initial", async () => {
    const { gateway, presence } = buildGateway();
    const socket = fakeSocket();
    socket.data = { userId: "u1" };
    await gateway.handleConnection(socket);
    expect(socket.join).toHaveBeenCalledWith("user:u1");
    await expect(presence.isOnline("u1")).resolves.toBe(true);
    expect(socket.emit).toHaveBeenCalledWith("notifications:initial", { unreadCount: 3 });
  });

  it("handleConnection desconecta si falta userId", async () => {
    const { gateway } = buildGateway();
    const socket = fakeSocket();
    socket.data = {};
    await gateway.handleConnection(socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("presence:watch une a las rooms de presencia (con cap de 100)", async () => {
    const { gateway } = buildGateway();
    const socket = fakeSocket();
    const ids = Array.from({ length: 120 }, (_, i) => `extra-${i}`);
    const result = await gateway.onPresenceWatch(socket, { userIds: [...["u1", "u2"], ...ids] });
    expect(result).toEqual({ ok: true });
    expect(socket.join).toHaveBeenCalledTimes(100);
    expect(socket.join).toHaveBeenCalledWith("presence:u1");
    expect(socket.join).not.toHaveBeenCalledWith("presence:extra-100");
  });

  it("presence:unwatch deja las rooms", async () => {
    const { gateway } = buildGateway();
    const socket = fakeSocket();
    await gateway.onPresenceUnwatch(socket, { userIds: ["u1"] });
    expect(socket.leave).toHaveBeenCalledWith("presence:u1");
  });

  it("heartbeat refresca la presencia", async () => {
    const { gateway, presence } = buildGateway();
    const socket = fakeSocket();
    socket.data = { userId: "u1" };
    await presence.setOnline("u1");
    await gateway.onHeartbeat(socket);
    const touchSpy = vi.spyOn(presence, "touch");
    await gateway.onHeartbeat(socket);
    expect(touchSpy).toHaveBeenCalledWith("u1");
    await expect(presence.isOnline("u1")).resolves.toBe(true);
  });

  it("handleDisconnect marca offline y emite presence:change al room", async () => {
    const { gateway, presence } = buildGateway();
    const server = fakeServer();
    gateway.afterInit(server);
    const socket = fakeSocket();
    socket.data = { userId: "u1" };
    await gateway.handleConnection(socket);
    await gateway.handleDisconnect(socket);
    await expect(presence.isOnline("u1")).resolves.toBe(false);
    expect(server.to).toHaveBeenCalledWith("presence:u1");
    const emitMock = (server.to as ReturnType<typeof vi.fn>).mock.results[0].value.emit;
    expect(emitMock).toHaveBeenCalledWith("presence:change", { userId: "u1", online: false });
  });

  it("emitNotificationNew envia al room user y no lanza sin server", () => {
    const { gateway } = buildGateway();
    const notification = {
      id: "n1",
      type: "like",
      actor: { id: "a", username: "a", displayName: null, avatarUrl: null },
      postId: null,
      commentId: null,
      read: false,
      createdAt: new Date().toISOString(),
    } as const;
    expect(() => gateway.emitNotificationNew("u1", notification, 4)).not.toThrow();
  });
});
