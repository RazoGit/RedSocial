import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";

import type {
  EmailPayload,
  PasswordChangedEmailPayload,
  PasswordResetEmailPayload,
  VerificationEmailPayload,
} from "./email.constants";
import { EmailService } from "./email.service";

const QUEUE_OPTIONS = expect.objectContaining({ attempts: 3 });

describe("EmailService (productor)", () => {
  const payload: VerificationEmailPayload = {
    to: "ana@example.com",
    verifyUrl: "http://localhost:3000/verify-email?token=abc",
  };

  it("encola el job verify-email con el payload y reintentos", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const queue = { add } as unknown as Queue<EmailPayload>;
    const service = new EmailService(queue);

    await service.enqueueVerificationEmail(payload);

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith("verify-email", payload, QUEUE_OPTIONS);
  });

  it("encola el job password-reset con el enlace de restablecimiento", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const queue = { add } as unknown as Queue<EmailPayload>;
    const service = new EmailService(queue);
    const resetPayload: PasswordResetEmailPayload = {
      to: "ana@example.com",
      resetUrl: "http://localhost:3000/reset-password?token=xyz",
    };

    await service.enqueuePasswordResetEmail(resetPayload);

    expect(add).toHaveBeenCalledWith("password-reset", resetPayload, QUEUE_OPTIONS);
  });

  it("encola el job password-changed con el destinatario", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const queue = { add } as unknown as Queue<EmailPayload>;
    const service = new EmailService(queue);
    const changedPayload: PasswordChangedEmailPayload = { to: "ana@example.com" };

    await service.enqueuePasswordChangedEmail(changedPayload);

    expect(add).toHaveBeenCalledWith("password-changed", changedPayload, QUEUE_OPTIONS);
  });

  it("propaga errores de la cola", async () => {
    const add = vi.fn().mockRejectedValue(new Error("redis down"));
    const queue = { add } as unknown as Queue<EmailPayload>;
    const service = new EmailService(queue);

    await expect(service.enqueueVerificationEmail(payload)).rejects.toThrow("redis down");
  });
});
