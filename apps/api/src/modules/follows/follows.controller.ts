import { Controller, Delete, HttpCode, HttpStatus, Param, Req, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";

import type { AccessTokenPayload } from "../auth/tokens.service";
import { FollowsService } from "./services/follows.service";

interface RequestWithUser extends FastifyRequest {
  user?: AccessTokenPayload;
}

function requireUser(request: RequestWithUser): AccessTokenPayload {
  const payload = request.user;
  if (!payload) throw new Error("missing_bearer_token");
  return payload;
}

/**
 * Endpoints de grafo social (spec 005). Follow/unfollow.
 */
@ApiTags("follows")
@Controller("users")
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  /** T5: seguir a un usuario. */
  @Post(":username/follow")
  @ApiOperation({ summary: "Seguir a un usuario" })
  @ApiResponse({ status: 200, description: "Ahora sigue al usuario" })
  @ApiResponse({ status: 400, description: "No puedes seguirte a ti mismo" })
  @ApiResponse({ status: 404, description: "Usuario no encontrado" })
  @ApiResponse({ status: 409, description: "Ya sigue a este usuario" })
  async follow(@Req() req: RequestWithUser, @Param("username") username: string) {
    const user = requireUser(req);
    return this.followsService.follow(user.sub, username);
  }

  /** T6: dejar de seguir a un usuario. */
  @Delete(":username/follow")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Dejar de seguir a un usuario" })
  @ApiResponse({ status: 200, description: "Dejó de seguir al usuario" })
  @ApiResponse({ status: 404, description: "Usuario no encontrado o no lo sigue" })
  async unfollow(@Req() req: RequestWithUser, @Param("username") username: string) {
    const user = requireUser(req);
    return this.followsService.unfollow(user.sub, username);
  }
}
