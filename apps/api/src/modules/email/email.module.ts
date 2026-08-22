import { Module, type FactoryProvider, type Provider } from "@nestjs/common";
import { BullModule, getQueueToken } from "@nestjs/bullmq";
import IORedis from "ioredis";
import { createTransport } from "nodemailer";

import { EMAIL_QUEUE, MAIL_TRANSPORTER } from "./email.constants";
import { EmailService } from "./email.service";
import { EmailWorker } from "./email.worker";

const mailTransporterProvider: FactoryProvider = {
  provide: MAIL_TRANSPORTER,
  useFactory: () =>
    createTransport({
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: false,
    }),
};

/** En tests se desactiva por completo para no requerir Redis/SMTP reales. */
const disabled = process.env.EMAIL_DISABLED === "true";

/**
 * Stub de cola para modo deshabilitado: mantiene resoluble la dependencia
 * de EmailService sin abrir conexiones reales.
 */
const disabledQueueProvider: Provider = {
  provide: getQueueToken(EMAIL_QUEUE),
  useValue: {
    add: async (): Promise<never> => {
      throw new Error("EmailModule esta deshabilitado (EMAIL_DISABLED=true)");
    },
  },
};

@Module({
  imports: [
    ...(disabled
      ? []
      : [
          BullModule.forRootAsync({
            useFactory: () => ({
              connection: new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
                maxRetriesPerRequest: null,
              }),
            }),
          }),
          BullModule.registerQueue({ name: EMAIL_QUEUE }),
        ]),
  ],
  providers: [
    ...(disabled ? [disabledQueueProvider] : []),
    EmailService,
    ...(disabled ? [] : [mailTransporterProvider, EmailWorker]),
  ],
  exports: [EmailService],
})
export class EmailModule {}
