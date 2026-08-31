import { Module } from "@nestjs/common";

import { LikesController } from "./likes.controller";
import { LikesService } from "./likes.service";

/**
 * Modulo de likes (spec 006). Like/unlike posts con contadores atomicos.
 */
@Module({
  controllers: [LikesController],
  providers: [LikesService],
  exports: [LikesService],
})
export class LikesModule {}
