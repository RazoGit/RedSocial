import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { CreateCommentRequestSchema, type CreateCommentRequest } from "@redsocial/contracts";

import type { AccessTokenPayload } from "../auth/tokens.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CommentsService } from "./comments.service";

interface RequestWithUser extends FastifyRequest {
  user?: AccessTokenPayload;
}

function requireUser(request: RequestWithUser): AccessTokenPayload {
  const payload = request.user;
  if (!payload) throw new Error("missing_bearer_token");
  return payload;
}

/**
 * Endpoints de comentarios (spec 006). Crear, listar, eliminar.
 */
@ApiTags("comments")
@Controller("posts")
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  /** T8: crear comentario. */
  @Post(":id/comments")
  @ApiOperation({ summary: "Crear comentario en un post" })
  @ApiResponse({ status: 201, description: "Comentario creado" })
  @ApiResponse({ status: 400, description: "Texto vacio o anidacion no permitida" })
  @ApiResponse({ status: 404, description: "Post no encontrado" })
  async create(
    @Req() req: RequestWithUser,
    @Param("id") postId: string,
    @Body(new ZodValidationPipe(CreateCommentRequestSchema)) body: CreateCommentRequest,
  ) {
    const user = requireUser(req);
    return this.commentsService.create(user.sub, postId, body);
  }

  /** T9: listar comentarios paginados. */
  @Get(":id/comments")
  @ApiOperation({ summary: "Listar comentarios de un post" })
  @ApiResponse({ status: 200, description: "Comentarios paginados" })
  @ApiResponse({ status: 404, description: "Post no encontrado" })
  async list(
    @Param("id") postId: string,
    @Query("limit") limit?: string,
    @Query("createdBefore") createdBefore?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.commentsService.list(postId, parsedLimit, createdBefore);
  }

  /** T10: eliminar comentario. */
  @Delete(":id/comments/:commentId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Eliminar un comentario" })
  @ApiResponse({ status: 200, description: "Comentario eliminado" })
  @ApiResponse({ status: 403, description: "No es el autor del comentario" })
  @ApiResponse({ status: 404, description: "Post o comentario no encontrado" })
  async remove(
    @Req() req: RequestWithUser,
    @Param("id") postId: string,
    @Param("commentId") commentId: string,
  ) {
    const user = requireUser(req);
    await this.commentsService.remove(user.sub, postId, commentId);
    return { ok: true };
  }
}
