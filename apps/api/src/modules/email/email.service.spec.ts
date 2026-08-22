import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";

import type { VerificationEmailPayload } from "./email.constants";
import { EmailService } from "./email.service";

describe("EmailService (productor)", () => {
  const payload: VerificationEmailPayload = {
    to: "ana@example.com",
    verifyUrl: "http://localhost:3000/verify-email?token=abc",
  };

  it("encola el job verify-email con el payload y reintentos", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const queue = { add } as unknown as Queue<VerificationEmailPayload>;
    const service = new EmailService(queue);

    await service.enqueueVerificationEmail(payload);

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      "verify-email",
      payload,
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it("propaga errores de la cola", async () => {
    const add = vi.fn().mockRejectedValue(new Error("redis down"));
    const queue = { add } as unknown as Queue<VerificationEmailPayload>;
    const service = new EmailService(queue);

    await expect(service.enqueueVerificationEmail(payload)).rejects.toThrow("redis down");
  });
});
