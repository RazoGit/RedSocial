import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

/**
 * Notificaciones (spec 007). REST + persistencia; las emisiones WS las
 * hace RealtimeGateway. Se exporta NotificationsService para que likes,
 * comments y follows emitan al crear sus entidades.
 */
@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
