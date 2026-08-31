import { Module } from "@nestjs/common";

import { NotificationsModule } from "../notifications/notifications.module";
import { LikesController } from "./likes.controller";
import { LikesService } from "./likes.service";

/**
 * Modulo de likes (spec 006). Like/unlike posts con contadores atomicos.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [LikesController],
  providers: [LikesService],
  exports: [LikesService],
})
export class LikesModule {}
