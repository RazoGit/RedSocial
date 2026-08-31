import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";

import { LikesModule } from "../likes/likes.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { FeedController } from "./feed.controller";
import { FollowsController } from "./follows.controller";
import { FeedCacheService, feedRedisClientProvider } from "./services/feed-cache.service";
import { FeedFanoutWorker, FEED_FANOUT_QUEUE } from "./services/feed-fanout.worker";
import { FeedService } from "./services/feed.service";
import { FollowsService } from "./services/follows.service";

/** En tests se desactiva BullMQ para no requerir Redis real. */
const disabled = process.env.MEDIA_DISABLED === "true";

/**
 * Modulo de grafo social (spec 005). Follow/unfollow, contadores y feed.
 * NOTA: BullModule.forRootAsync se configura en UsersModule (único punto).
 */
@Module({
  imports: [
    LikesModule,
    NotificationsModule,
    ...(disabled ? [] : [BullModule.registerQueue({ name: FEED_FANOUT_QUEUE })]),
  ],
  controllers: [FollowsController, FeedController],
  providers: [
    FollowsService,
    FeedService,
    FeedCacheService,
    feedRedisClientProvider,
    FeedFanoutWorker,
  ],
  exports: [FollowsService, FeedService, FeedCacheService],
})
export class FollowsModule {}
