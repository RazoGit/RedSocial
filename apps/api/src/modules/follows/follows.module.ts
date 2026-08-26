import { Module } from "@nestjs/common";

import { FollowsController } from "./follows.controller";
import { FollowsService } from "./services/follows.service";

/**
 * Modulo de grafo social (spec 005). Follow/unfollow y contadores.
 */
@Module({
  controllers: [FollowsController],
  providers: [FollowsService],
  exports: [FollowsService],
})
export class FollowsModule {}
