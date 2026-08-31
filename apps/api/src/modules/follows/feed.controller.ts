import { Controller, Get, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { FeedQuerySchema } from "@redsocial/contracts";
import type { FeedQuery } from "@redsocial/contracts";
import type { FastifyRequest } from "fastify";

import type { AccessTokenPayload } from "../auth/tokens.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { FeedService } from "./services/feed.service";

interface RequestWithUser extends FastifyRequest {
  user?: AccessTokenPayload;
}

function requireUser(request: RequestWithUser): AccessTokenPayload {
  const payload = request.user;
  if (!payload) throw new Error("missing_bearer_token");
  return payload;
}

/**
 * Endpoint de feed principal (spec 005 RF-7). Requiere autenticación.
 */
@ApiTags("feed")
@Controller("feed")
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  @ApiOperation({ summary: "Feed cronológico de seguidos" })
  @ApiResponse({ status: 200, description: "Posts paginados de usuarios seguidos" })
  @ApiResponse({ status: 401, description: "Token de acceso requerido" })
  async getFeed(
    @Req() req: RequestWithUser,
    @Query(new ZodValidationPipe(FeedQuerySchema)) query: FeedQuery,
  ) {
    const user = requireUser(req);
    return this.feedService.getFeed(user.sub, query.limit, query.createdBefore);
  }
}
