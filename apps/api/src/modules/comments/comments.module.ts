import { Module } from "@nestjs/common";

import { NotificationsModule } from "../notifications/notifications.module";
import { CommentsController } from "./comments.controller";
import { CommentsService } from "./comments.service";

/**
 * Modulo de comentarios (spec 006). Crear, listar, eliminar con contadores atomicos.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
