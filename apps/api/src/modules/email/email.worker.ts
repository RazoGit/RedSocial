import { Inject, Injectable } from "@nestjs/common";
import { WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import type { Transporter } from "nodemailer";

import { MAIL_TRANSPORTER, type VerificationEmailPayload } from "./email.constants";

/**
 * Worker inline temporal (spec 001, §9 Dependencias): consume la cola `email`
 * dentro del proceso API en dev y envia via SMTP al Mailpit local.
 * El consumer definitivo vive en apps/workers (Fase 8); este se retira entonces.
 */
@Injectable()
export class EmailWorker extends WorkerHost {
  constructor(@Inject(MAIL_TRANSPORTER) private readonly transporter: Transporter) {
    super();
  }

  async process(job: Job<VerificationEmailPayload>): Promise<void> {
    if (job.name !== "verify-email") return;

    const { to, verifyUrl } = job.data;
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM ?? "dev@redsocial.local",
      to,
      subject: "Verifica tu cuenta | R",
      text: `Bienvenido a R. Confirma tu email: ${verifyUrl} (el enlace expira en 24 horas)`,
      html: `<p>Bienvenido a <strong>R</strong>.</p>
<p><a href="${verifyUrl}">Verificar mi email</a></p>
<p>El enlace expira en 24 horas.</p>`,
    });
  }
}
