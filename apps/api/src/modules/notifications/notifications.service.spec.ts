import { describe, expect, it, vi } from "vitest";

import { NotificationsService } from "./notifications.service";
import { FakePrisma } from "../../testing/fake-prisma";
import { PrismaService } from "../prisma/prisma.service";

function realtimeSpy() {
  return {
    emitNotificationNew: vi.fn(),
    emitUnreadCount: vi.fn(),
    emitPresenceChange: vi.fn(),
  };
}

function build() {
  const prisma = new FakePrisma();
  const realtime = realtimeSpy();
  const service = new NotificationsService(prisma as unknown as PrismaService, realtime as never);
  return { prisma, realtime, service };
}

async function seedUser(prisma: FakePrisma, email: string) {
  return prisma.user.create({ data: { email, emailVerified: true } });
}

describe("NotificationsService", () => {
  it("create no notifica a uno mismo ni sin receptor", async () => {
    const { prisma, realtime, service } = build();
    const u = await seedUser(prisma, "self@example.com");

    await service.create(u.id, { actorId: u.id, type: "like", postId: "p1" });
    await service.create(u.id, { actorId: u.id, type: "follow" });
    expect(prisma.notifications).toHaveLength(0);
    expect(realtime.emitNotificationNew).not.toHaveBeenCalled();
  });

  it("create persiste y emite con unreadCount incrementado", async () => {
    const { prisma, realtime, service } = build();
    const receiver = await seedUser(prisma, "r@example.com");
    const actor = await seedUser(prisma, "a@example.com");

    await service.create(receiver.id, { actorId: actor.id, type: "like", postId: "p1" });
    await service.create(receiver.id, { actorId: actor.id, type: "comment", postId: "p1" });

    expect(prisma.notifications).toHaveLength(2);
    expect(realtime.emitNotificationNew).toHaveBeenCalledTimes(2);
    // primera emision: unreadCount 1; segunda: 2
    const first = realtime.emitNotificationNew.mock.calls[0];
    expect(first?.[2]).toBe(1);
    const second = realtime.emitNotificationNew.mock.calls[1];
    expect(second?.[2]).toBe(2);
  });

  it("create no rompe si la emision falla (RF-11)", async () => {
    const { prisma } = build();
    const receiver = await seedUser(prisma, "r2@example.com");
    const actor = await seedUser(prisma, "a2@example.com");

    const brokenRealtime = {
      emitNotificationNew: vi.fn(() => {
        throw new Error("ws caido");
      }),
      emitUnreadCount: vi.fn(),
    };
    const svc = new NotificationsService(
      prisma as unknown as PrismaService,
      brokenRealtime as never,
    );
    await expect(
      svc.create(receiver.id, { actorId: actor.id, type: "follow" }),
    ).resolves.toBeUndefined();
    expect(prisma.notifications).toHaveLength(1);
  });

  it("findMany pagina descendente y devuelve nextCursor cuando hay mas", async () => {
    const { prisma, service } = build();
    const receiver = await seedUser(prisma, "list@example.com");
    const actor = await seedUser(prisma, "actor@example.com");
    for (let i = 0; i < 25; i += 1) {
      // Delay para timestamps distintos y cursor estable (like->real DB).
      await prisma.notification.create({
        data: { userId: receiver.id, actorId: actor.id, type: "like", postId: `p${i}` },
      });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const page1 = await service.findMany(receiver.id, { limit: 20 });
    expect(page1.items).toHaveLength(20);
    expect(page1.nextCursor).not.toBeNull();
    expect(page1.unreadCount).toBe(25);

    const page2 = await service.findMany(receiver.id, {
      limit: 20,
      createdBefore: page1.nextCursor ?? undefined,
    });
    expect(page2.items).toHaveLength(5);
    expect(page2.nextCursor).toBeNull();
  });

  it("findMany devuelve actor hidratado y read correcto", async () => {
    const { prisma, service } = build();
    const receiver = await seedUser(prisma, "hydra@example.com");
    const actor = await seedUser(prisma, "visible@example.com");
    actor.username = "visible";
    actor.avatarThumbKey = "k";
    await prisma.notification.create({
      data: { userId: receiver.id, actorId: actor.id, type: "follow" },
    });

    const res = await service.findMany(receiver.id, { limit: 20 });
    const item = res.items[0];
    expect(item?.type).toBe("follow");
    expect(item?.read).toBe(false);
    expect(item?.actor.username).toBe("visible");
    expect(item?.actor.avatarUrl).toBe(`/avatars/${actor.id}/thumb`);
    expect(item?.postId).toBeNull();
  });

  it("markRead marca solo si es del dueno", async () => {
    const { prisma, realtime, service } = build();
    const owner = await seedUser(prisma, "owner@example.com");
    const other = await seedUser(prisma, "other@example.com");
    const row = await prisma.notification.create({
      data: { userId: owner.id, actorId: other.id, type: "like", postId: "p1" },
    });

    await expect(service.markRead(other.id, row.id)).rejects.toThrow();
    expect(prisma.notifications[0]?.readAt).toBeNull();

    const res = await service.markRead(owner.id, row.id);
    expect(res).toEqual({ id: row.id, read: true });
    expect(prisma.notifications[0]?.readAt).not.toBeNull();
    expect(realtime.emitUnreadCount).toHaveBeenCalledWith(owner.id, 0);
  });

  it("markRead es idempotente si ya estaba leida", async () => {
    const { prisma, realtime, service } = build();
    const owner = await seedUser(prisma, "idem@example.com");
    const other = await seedUser(prisma, "idem2@example.com");
    const row = await prisma.notification.create({
      data: { userId: owner.id, actorId: other.id, type: "follow" },
    });
    await service.markRead(owner.id, row.id);
    await service.markRead(owner.id, row.id);
    expect(realtime.emitUnreadCount).toHaveBeenCalledTimes(2);
  });

  it("markAllRead marca todas y emite el conteo restante", async () => {
    const { prisma, realtime, service } = build();
    const owner = await seedUser(prisma, "all@example.com");
    const actor = await seedUser(prisma, "all2@example.com");
    for (let i = 0; i < 3; i += 1) {
      await prisma.notification.create({
        data: { userId: owner.id, actorId: actor.id, type: "like", postId: `p${i}` },
      });
    }
    const res = await service.markAllRead(owner.id);
    expect(res).toEqual({ ok: true });
    expect(prisma.notifications.every((n) => n.readAt !== null)).toBe(true);
    expect(realtime.emitUnreadCount).toHaveBeenCalledWith(owner.id, 0);
  });

  it("unreadCount cuenta solo las no leidas", async () => {
    const { prisma, service } = build();
    const owner = await seedUser(prisma, "count@example.com");
    const actor = await seedUser(prisma, "count2@example.com");
    const row = await prisma.notification.create({
      data: { userId: owner.id, actorId: actor.id, type: "follow" },
    });
    expect(await service.unreadCount(owner.id)).toEqual({ unreadCount: 1 });
    await prisma.notification.updateMany({
      where: { userId: owner.id, id: { in: [row.id] }, readAt: null },
      data: { readAt: new Date() },
    });
    expect(await service.unreadCount(owner.id)).toEqual({ unreadCount: 0 });
  });
});
