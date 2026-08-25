import { Module, type FactoryProvider, type Provider } from "@nestjs/common";
import { BullModule, getQueueToken } from "@nestjs/bullmq";
import { S3Client } from "@aws-sdk/client-s3";
import IORedis from "ioredis";

import { POST_MEDIA_QUEUE, S3_CLIENT } from "./posts.constants";
import { PostMediaService } from "./services/post-media.service";
import { StorageService } from "./services/storage.service";
import { PostsService } from "./services/posts.service";
import { PostsController } from "./posts.controller";

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
  provide: getQueueToken(POST_MEDIA_QUEUE),
  useValue: {
    add: async (): Promise<never> => {
      throw new Error("PostsModule multimedia esta deshabilitado (MEDIA_DISABLED=true)");
    },
  },
};

/**
 * Modulo de posts y contenido (spec 004). CRUD, media y feed paginado.
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
          BullModule.registerQueue({ name: POST_MEDIA_QUEUE }),
        ]),
  ],
  controllers: [PostsController],
  providers: [
    s3ClientProvider,
    StorageService,
    PostMediaService,
    PostsService,
    ...(disabled ? [disabledQueueProvider] : []),
  ],
  exports: [PostsService, PostMediaService],
})
export class PostsModule {}
