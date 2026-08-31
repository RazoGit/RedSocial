import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PresenceModule } from "../presence/presence.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RealtimeGateway } from "./realtime.gateway";

/**
 * Tiempo real (spec 007). Expone el gateway autenticado para que
 * NotificationsService emita eventos WS tras persistir.
 */
@Module({
  imports: [AuthModule, PresenceModule, PrismaModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
