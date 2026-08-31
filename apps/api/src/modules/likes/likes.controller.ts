import { Controller, Delete, HttpCode, HttpStatus, Param, Req, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";

import type { AccessTokenPayload } from "../auth/tokens.service";
import { LikesService } from "./likes.service";

interface RequestWithUser extends FastifyRequest {
  user?: AccessTokenPayload;
}

function requireUser(request: RequestWithUser): AccessTokenPayload {
  const payload = request.user;
  if (!payload) throw new Error("missing_bearer_token");
  return payload;
}

/**
 * Endpoints de likes (spec 006). Like/unlike posts.
 */
@ApiTags("likes")
@Controller("posts")
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  /** T5: dar like a un post. */
  @Post(":id/like")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Dar like a un post" })
  @ApiResponse({ status: 200, description: "Like agregado" })
  @ApiResponse({ status: 404, description: "Post no encontrado" })
  @ApiResponse({ status: 409, description: "Ya le dio like" })
  async like(@Req() req: RequestWithUser, @Param("id") postId: string) {
    const user = requireUser(req);
    return this.likesService.like(user.sub, postId);
  }

  /** T6: quitar like. */
  @Delete(":id/like")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Quitar like de un post" })
  @ApiResponse({ status: 200, description: "Like removido" })
  @ApiResponse({ status: 404, description: "Post no encontrado o no liked" })
  async unlike(@Req() req: RequestWithUser, @Param("id") postId: string) {
    const user = requireUser(req);
    return this.likesService.unlike(user.sub, postId);
  }
}
