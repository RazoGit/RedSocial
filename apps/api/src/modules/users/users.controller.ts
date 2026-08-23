import {
  BadRequestException,
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
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { PresignAvatarRequestSchema, UpdateProfileRequestSchema } from "@redsocial/contracts";
import type { FastifyRequest } from "fastify";

import type { AccessTokenPayload } from "../auth/tokens.service";
import { OptionalJwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AvatarService } from "./services/avatar.service";
import {
  apiErrorResponseJsonSchema,
  checkUsernameResponseJsonSchema,
  meProfileResponseJsonSchema,
  minimalProfileResponseJsonSchema,
  presignAvatarRequestJsonSchema,
  presignAvatarResponseJsonSchema,
  updateProfileRequestJsonSchema,
  userProfileResponseJsonSchema,
  type CheckUsernameResponse,
  type MeProfileResponse,
  type MinimalProfileResponse,
  type PresignAvatarRequest,
  type PresignAvatarResponse,
  type UpdateProfileRequest,
  type UserProfileResponse,
} from "./dto/users.dto";
import { UsersService } from "./users.service";

interface RequestWithUser extends FastifyRequest {
  user?: AccessTokenPayload;
}

function requireUser(request: RequestWithUser): AccessTokenPayload {
  const payload = request.user;
  if (!payload) throw new UnauthorizedException("missing_bearer_token");
  return payload;
}

/**
 * Endpoints de perfil (spec 002). Las rutas literales (check-username) se
 * declaran antes que cualquier :username para evitar capturas ambiguas.
 */
@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly avatarService: AvatarService,
  ) {}

  @Get("me")
  @ApiOperation({
    summary: "Perfil completo del usuario autenticado",
    description:
      "RF-6: incluye username provisional, datos editables y auditoria updatedAt. Requiere access token Bearer.",
  })
  @ApiResponse({ status: HttpStatus.OK, schema: meProfileResponseJsonSchema })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Bearer ausente o cuenta inexistente/borrada",
    schema: apiErrorResponseJsonSchema,
  })
  me(@Req() request: RequestWithUser): Promise<MeProfileResponse> {
    return this.usersService.getMe(requireUser(request).sub);
  }

  @Patch("me")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Actualiza el perfil del usuario autenticado",
    description:
      "Acepta displayName, bio, isPrivate y username. El primer cambio de username es gratis; despues maximo uno cada 14 dias y el anterior queda reservado 30 dias (RF-3).",
  })
  @ApiBody({ schema: updateProfileRequestJsonSchema })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Perfil actualizado",
    schema: meProfileResponseJsonSchema,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Bearer ausente o cuenta borrada",
    schema: apiErrorResponseJsonSchema,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: "username_tomado: ya existe otro usuario con ese username",
    schema: apiErrorResponseJsonSchema,
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: "username_reservado o username_cooldown_activo",
    schema: apiErrorResponseJsonSchema,
  })
  update(
    @Body(new ZodValidationPipe(UpdateProfileRequestSchema)) dto: UpdateProfileRequest,
    @Req() request: RequestWithUser,
  ): Promise<MeProfileResponse> {
    return this.usersService.updateMe(requireUser(request).sub, dto);
  }

  @Post("me/avatar/presign")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Emite una URL PUT pre-firmada para el avatar",
    description:
      "RF-4: acepta JPEG/PNG/WebP de hasta 2 MB; devuelve uploadUrl valida 15 min, la key destino y programa el job que genera thumbnail 256px + blurhash.",
  })
  @ApiBody({ schema: presignAvatarRequestJsonSchema })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "URL de subida emitida y procesamiento programado",
    schema: presignAvatarResponseJsonSchema,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Tipo o peso no admitidos (validation_failed)",
    schema: apiErrorResponseJsonSchema,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Bearer ausente o cuenta borrada",
    schema: apiErrorResponseJsonSchema,
  })
  presignAvatar(
    @Body(new ZodValidationPipe(PresignAvatarRequestSchema)) dto: PresignAvatarRequest,
    @Req() request: RequestWithUser,
  ): Promise<PresignAvatarResponse> {
    return this.avatarService.createPresignedUpload(requireUser(request).sub, dto.contentType);
  }

  @Public()
  @Get("check-username")
  @ApiOperation({
    summary: "Consulta la disponibilidad de un username",
    description:
      "Publico. Devuelve available=true o el motivo: taken (ocupado), reserved (prohibido) o invalid_format (no cumple 3-20 de a-z0-9_).",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Resultado de disponibilidad",
    schema: checkUsernameResponseJsonSchema,
  })
  async checkUsername(@Query("u") u?: string): Promise<CheckUsernameResponse> {
    if (typeof u !== "string" || u.length === 0) {
      throw new BadRequestException("falta_parametro_u");
    }
    return this.usersService.checkUsername(u);
  }

  /**
   * RF-5: declarada al final para no sombrear check-username. Publica con
   * auth opcional: si trae Bearer valido el espectador puede ver perfiles
   * privados propios; sin token se aplica la vista minima si corresponde.
   */
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(":username")
  @ApiOperation({
    summary: "Perfil publico por username",
    description:
      "Devuelve la vista completa si el perfil es publico o el espectador es el dueno; ante un perfil privado ajeno entrega solo username, displayName y avatar (RF-5).",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Vista completa del perfil",
    schema: userProfileResponseJsonSchema,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Vista minima de un perfil privado ante terceros",
    schema: minimalProfileResponseJsonSchema,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Username inexistente o cuenta borrada",
    schema: apiErrorResponseJsonSchema,
  })
  getProfile(
    @Param("username") username: string,
    @Req() request: RequestWithUser,
  ): Promise<UserProfileResponse | MinimalProfileResponse> {
    const viewerId = request.user?.sub;
    return this.usersService.getPublicProfile(username, viewerId);
  }
}
