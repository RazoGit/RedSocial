import { Module, forwardRef, type FactoryProvider, type Provider } from "@nestjs/common";
import { BullModule, getQueueToken } from "@nestjs/bullmq";
import { S3Client } from "@aws-sdk/client-s3";
import IORedis from "ioredis";

import { AuthModule } from "../auth/auth.module";

import { MEDIA_QUEUE, S3_CLIENT } from "./users.constants";
import { UsernameService } from "./services/username.service";
import { StorageService } from "./services/storage.service";
import { AvatarService } from "./services/avatar.service";
import { MediaWorker } from "./services/media.worker";
import { ProfileCacheService, profileRedisClientProvider } from "./services/profile-cache.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

/** Cliente S3 compartido: MinIO en dev (forcePathStyle), R2/S3 en prod. */
const s3ClientProvider: FactoryProvider = {
  provide: S3_CLIENT,
  useFactory: () =>
    new S3Client({
      endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
      region: process.env.S3_REGION ?? "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin123",
      },
      forcePathStyle: true,
    }),
};

/** En tests se desactiva por completo para no requerir Redis/S3 reales. */
const disabled = process.env.MEDIA_DISABLED === "true";

const disabledQueueProvider: Provider = {
  provide: getQueueToken(MEDIA_QUEUE),
  useValue: {
    add: async (): Promise<never> => {
      throw new Error("UsersModule multimedia esta deshabilitado (MEDIA_DISABLED=true)");
    },
  },
};

/**
 * Modulo de usuarios y perfiles (spec 002). Exporta UsernameService para que
 * registro y OAuth creen cuentas con perfil provisional.
 */
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
          BullModule.registerQueue({ name: MEDIA_QUEUE }),
        ]),
    // AuthModule exporta TokensService (guard opcional de /users/:username);
    // forwardRef rompe la circularidad AuthModule <-> UsersModule.
    forwardRef(() => AuthModule),
  ],
  controllers: [UsersController],
  providers: [
    // El cliente S3 se construye sin red (firmas locales); siempre disponible.
    s3ClientProvider,
    profileRedisClientProvider,
    UsernameService,
    UsersService,
    StorageService,
    AvatarService,
    ProfileCacheService,
    ...(disabled ? [disabledQueueProvider] : [MediaWorker]),
  ],
  exports: [UsernameService],
})
export class UsersModule {}
