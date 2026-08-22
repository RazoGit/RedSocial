import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";

import { EMAIL_QUEUE, type VerificationEmailPayload } from "./email.constants";

/**
 * Productor de la cola `email` (BullMQ sobre Redis).
 * La peticion HTTP nunca espera al SMTP: solo encola (spec 001, RF-2 y NFR).
 */
@Injectable()
export class EmailService {
  constructor(@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue<VerificationEmailPayload>) {}

  async enqueueVerificationEmail(payload: VerificationEmailPayload): Promise<void> {
    await this.queue.add("verify-email", payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: true,
      removeOnFail: { age: 24 * 3600 },
    });
  }
}
