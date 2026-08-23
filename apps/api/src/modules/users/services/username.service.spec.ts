import { describe, expect, it } from "vitest";

import { PrismaService } from "../../prisma/prisma.service";
import { FakePrisma } from "../../../testing/fake-prisma";
import { UsernameService } from "./username.service";

function makeService(fake?: FakePrisma): { service: UsernameService; fake: FakePrisma } {
  const store = fake ?? new FakePrisma();
  return { service: new UsernameService(store as unknown as PrismaService), fake: store };
}

describe("UsernameService.deriveProvisional", () => {
  it.each([
    ["ana.garcia.92@example.com", "ana_garcia_92"],
    ["Ana+newsletter@mail.org", "ana_newsletter"],
    ["__raro__name__@x.io", "raro_name"],
    ["a@b.co", "a__"],
    ["nombre.demasiado.largo.para.usar@example.com", "nombre_demasiado"],
    ["ñandu@ejemplo.cl", "nandu"],
  ])("deriva %s -> %s", (email, expected) => {
    const { service } = makeService();
    expect(service.deriveProvisional(email)).toBe(expected);
  });
});

describe("UsernameService.unavailabilityReason", () => {
  it("invalid_format para longitudes o caracteres fuera de regla", async () => {
    const { service } = makeService();
    expect(await service.unavailabilityReason("ab")).toBe("invalid_format");
    expect(await service.unavailabilityReason("a".repeat(21))).toBe("invalid_format");
    expect(await service.unavailabilityReason("con-guion")).toBe("invalid_format");
    expect(await service.unavailabilityReason("ConMayus")).toBe("invalid_format");
  });

  it("reserved para la lista configurada", async () => {
    const { service } = makeService();
    expect(await service.unavailabilityReason("admin")).toBe("reserved");
    expect(service.isReserved("ADMIN")).toBe(true);
    expect(await service.unavailabilityReason("support")).toBe("reserved");
  });

  it("taken contra usuario activo y libre si fue borrado logicamente", async () => {
    const { service, fake } = makeService();
    await fake.user.create({ data: { email: "toma@example.com", username: "toma" } });
    const active = fake.users[0];
    expect(await service.unavailabilityReason("toma")).toBe("taken");

    active.deletedAt = new Date();
    expect(await service.unavailabilityReason("toma")).toBeNull();
  });

  it("taken contra historial con liberacion pendiente y libre tras la fecha", async () => {
    const { service, fake } = makeService();
    const user = await fake.user.create({ data: { email: "hist@example.com", username: "nuevo" } });
    fake.usernameHistoryRows.push({
      id: "h1",
      userId: user.id,
      username: "viejo",
      releasedAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    });
    expect(await service.unavailabilityReason("viejo")).toBe("taken");

    fake.usernameHistoryRows[0].releasedAt = new Date(Date.now() - 60_000);
    expect(await service.unavailabilityReason("viejo")).toBeNull();
  });

  it("isAvailable refleja unavailabilityReason", async () => {
    const { service, fake } = makeService();
    await fake.user.create({ data: { email: "libre@example.com", username: "libre" } });
    expect(await service.isAvailable("libre")).toBe(false);
    expect(await service.isAvailable("disponible_ok")).toBe(true);
  });
});

describe("UsernameService.generateUniqueProvisional", () => {
  it("usa la derivacion limpia cuando esta libre", async () => {
    const { service } = makeService();
    await expect(service.generateUniqueProvisional("maria.jose@example.com")).resolves.toBe(
      "maria_jose",
    );
  });

  it("anade sufijo corto cuando la derivacion colisiona", async () => {
    const { service, fake } = makeService();
    await fake.user.create({ data: { email: "otro@x.com", username: "pepe" } });
    const generated = await service.generateUniqueProvisional("PEPE@yahoo.com");
    expect(generated).toMatch(/^pepe_[0-9a-f]{4}$/);
    expect(await service.isAvailable(generated)).toBe(true);
  });

  it("rellena con guion bajo cuando la parte local es demasiado corta", async () => {
    const { service } = makeService();
    await expect(service.generateUniqueProvisional("a@b.co")).resolves.toMatch(/^a(_{1,2})$/);
  });
});

describe("USERNAME_RESERVED por entorno", () => {
  it("acepta lista personalizada separada por comas", async () => {
    process.env.USERNAME_RESERVED = "dueno,staff";
    try {
      const { service } = makeService();
      expect(await service.isReserved("Dueno")).toBe(true);
      expect(await service.isReserved("admin")).toBe(false);
    } finally {
      delete process.env.USERNAME_RESERVED;
    }
  });
});
