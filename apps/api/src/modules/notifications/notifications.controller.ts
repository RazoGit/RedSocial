import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";

import { MarkNotificationsReadRequestSchema, NotificationsQuerySchema } from "@redsocial/contracts";
import type { MarkNotificationsReadRequest, NotificationsQuery } from "@redsocial/contracts";

import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AccessTokenPayload } from "../auth/tokens.service";
import { NotificationsService } from "./notifications.service";

interface RequestWithUser extends FastifyRequest {
  user: AccessTokenPayload;
}

/**
 * Notificaciones (spec 007). Lista paginada, lectura y conteo de no leidas.
 */
@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** RF-5: lista paginada cursor-based. */
  @Get()
  @ApiOperation({ summary: "Notificaciones del usuario autenticado" })
  @ApiResponse({ status: 200, description: "Lista paginada + unreadCount" })
  list(
    @Query(new ZodValidationPipe(NotificationsQuerySchema)) query: NotificationsQuery,
    @Req() req: RequestWithUser,
  ) {
    return this.notifications.findMany(req.user.sub, query);
  }

  /** RF-6: marcar una notificacion como leida. */
  @Patch(":id/read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Marcar una notificacion como leida" })
  @ApiResponse({ status: 200, description: "Marcada como leida" })
  @ApiResponse({ status: 404, description: "No encontrada o ajena" })
  markRead(@Param("id") id: string, @Req() req: RequestWithUser) {
    return this.notifications.markRead(req.user.sub, id);
  }

  /** RF-6: marcar todas como leidas (o un subconjunto opcional). */
  @Post("read-all")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Marcar todas las notificaciones como leidas" })
  @ApiResponse({ status: 200, description: "No leidas marcadas; emite unreadCount" })
  markAllRead(
    @Body(new ZodValidationPipe(MarkNotificationsReadRequestSchema))
    body: MarkNotificationsReadRequest,
    @Req() req: RequestWithUser,
  ) {
    return this.notifications.markAllRead(req.user.sub, body?.ids);
  }

  /** RF-7/RF-10: conteo actual de no leidas (fallback sin WS). */
  @Get("unread-count")
  @ApiOperation({ summary: "Conteo de notificaciones no leidas" })
  @ApiResponse({ status: 200, description: "{ unreadCount }" })
  unreadCount(@Req() req: RequestWithUser) {
    return this.notifications.unreadCount(req.user.sub);
  }
}
