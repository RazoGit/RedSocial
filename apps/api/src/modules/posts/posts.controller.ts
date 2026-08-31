import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  CreatePostRequestSchema,
  CursorPaginationSchema,
  PresignPostMediaRequestSchema,
} from "@redsocial/contracts";
import type { FastifyRequest } from "fastify";

import type { AccessTokenPayload } from "../auth/tokens.service";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type {
  CreatePostRequest,
  CursorPagination,
  PresignPostMediaRequest,
} from "@redsocial/contracts";
import { PostMediaService } from "./services/post-media.service";
import { PostsService } from "./services/posts.service";

interface RequestWithUser extends FastifyRequest {
  user?: AccessTokenPayload;
}

function requireUser(request: RequestWithUser): AccessTokenPayload {
  const payload = request.user;
  if (!payload) throw new UnauthorizedException("missing_bearer_token");
  return payload;
}

/**
 * Endpoints de posts (spec 004). CRUD + media presign + feed paginado.
 */
@ApiTags("posts")
@Controller("posts")
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
    private readonly postMediaService: PostMediaService,
  ) {}

  /** T4: presign para imagen de post. */
  @Post("media/presign")
  @ApiOperation({ summary: "URL pre-firmada para imagen de post" })
  @ApiResponse({ status: 200, description: "URL de subida" })
  @ApiResponse({ status: 400, description: "Tipo o tamano invalido" })
  async presignMedia(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(PresignPostMediaRequestSchema)) dto: PresignPostMediaRequest,
  ) {
    const user = requireUser(req);
    return this.postMediaService.createPresignedUpload(user.sub, dto.contentType);
  }

  /** T6: crear post. */
  @Post()
  @ApiOperation({ summary: "Crear publicacion" })
  @ApiResponse({ status: 201, description: "Post creado" })
  @ApiResponse({ status: 422, description: "Texto o imagenes requeridos" })
  async create(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(CreatePostRequestSchema)) dto: CreatePostRequest,
  ) {
    const user = requireUser(req);
    return this.postsService.create(user.sub, dto);
  }

  /** T7: detalle de post. */
  @Public()
  @Get(":id")
  @ApiOperation({ summary: "Detalle de publicacion" })
  @ApiResponse({ status: 200, description: "Post encontrado" })
  @ApiResponse({ status: 404, description: "Post no encontrado" })
  async findOne(@Param("id") id: string, @Req() req: RequestWithUser) {
    const viewerId = req.user?.sub;
    return this.postsService.findById(id, viewerId);
  }

  /** T8: editar texto de post. */
  @Patch(":id")
  @ApiOperation({ summary: "Editar texto de publicacion" })
  @ApiResponse({ status: 200, description: "Post actualizado" })
  @ApiResponse({ status: 403, description: "No es el autor" })
  @ApiResponse({ status: 404, description: "Post no encontrado" })
  async update(
    @Req() req: RequestWithUser,
    @Param("id") id: string,
    @Body() body: { text: string },
  ) {
    const user = requireUser(req);
    return this.postsService.updateText(id, user.sub, body.text);
  }

  /** T9: borrado logico de post. */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Eliminar publicacion" })
  @ApiResponse({ status: 204, description: "Post eliminado" })
  @ApiResponse({ status: 403, description: "No es el autor" })
  @ApiResponse({ status: 404, description: "Post no encontrado" })
  async remove(@Req() req: RequestWithUser, @Param("id") id: string) {
    const user = requireUser(req);
    await this.postsService.softDelete(id, user.sub);
  }

  /** T10: feed propio paginado cursor-based. */
  @Public()
  @Get("user/:username")
  @ApiOperation({ summary: "Feed propio paginado" })
  @ApiResponse({ status: 200, description: "Posts paginados" })
  async findByAuthor(
    @Param("username") username: string,
    @Query(new ZodValidationPipe(CursorPaginationSchema)) query: CursorPagination,
    @Req() req: RequestWithUser,
  ) {
    return this.postsService.findByAuthor(
      username,
      query.limit,
      query.createdBefore,
      req.user?.sub,
    );
  }
}
