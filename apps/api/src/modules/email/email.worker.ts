import { Inject, Injectable } from "@nestjs/common";
import { WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import type { Transporter } from "nodemailer";

import { MAIL_TRANSPORTER, type EmailPayload } from "./email.constants";

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

  async process(job: Job<EmailPayload>): Promise<void> {
    switch (job.name) {
      case "verify-email":
        return this.sendVerification(job);
      case "password-reset":
        return this.sendPasswordReset(job);
      case "password-changed":
        return this.sendPasswordChanged(job);
      default:
        return;
    }
  }

  private async sendVerification(job: Job<EmailPayload>): Promise<void> {
    const { to, verifyUrl } = job.data as { to: string; verifyUrl: string };
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

  /** RF-11: el enlace de recuperacion es valido durante 1 hora. */
  private async sendPasswordReset(job: Job<EmailPayload>): Promise<void> {
    const { to, resetUrl } = job.data as { to: string; resetUrl: string };
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM ?? "dev@redsocial.local",
      to,
      subject: "Recupera tu contrasena | R",
      text: `Recibimos una solicitud para restablecer tu contrasena: ${resetUrl} (el enlace expira en 1 hora). Si no fuiste tu, ignora este mensaje.`,
      html: `<p>Recibimos una solicitud para restablecer tu contrasena en <strong>R</strong>.</p>
<p><a href="${resetUrl}">Restablecer contrasena</a></p>
<p>El enlace expira en 1 hora. Si no fuiste tu, ignora este mensaje.</p>`,
    });
  }

  /** RF-12: aviso de seguridad cuando la contrasena cambia. */
  private async sendPasswordChanged(job: Job<EmailPayload>): Promise<void> {
    const { to } = job.data as { to: string };
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM ?? "dev@redsocial.local",
      to,
      subject: "Tu contrasena cambio | R",
      text: "Tu contrasena se restablecio correctamente y cerramos todas las sesiones activas. Si no fuiste tu, solicita otro restablecimiento de inmediato.",
      html: `<p>Tu contrasena en <strong>R</strong> se restablecio correctamente y cerramos todas las sesiones activas.</p>
<p>Si no fuiste tu, solicita otro restablecimiento de inmediato.</p>`,
    });
  }
}
