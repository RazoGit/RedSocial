import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  RegisterRequestSchema,
  ResendVerificationRequestSchema,
  VerifyEmailRequestSchema,
} from "@redsocial/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AuthService } from "./auth.service";
import {
  acceptedResponseJsonSchema,
  apiErrorResponseJsonSchema,
  registerRequestJsonSchema,
  registerResponseJsonSchema,
  resendVerificationRequestJsonSchema,
  verifyEmailRequestJsonSchema,
  verifyEmailResponseJsonSchema,
  type RegisterRequest,
  type RegisterResponse,
  type ResendVerificationRequest,
  type AcceptedResponse,
  type VerifyEmailRequest,
  type VerifyEmailResponse,
} from "./dto/auth.dto";
import { RefreshCookieService } from "./services/refresh-cookie.service";
import type { AccessTokenPayload } from "./tokens.service";

interface RequestWithUser extends FastifyRequest {
  user?: AccessTokenPayload;
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly refreshCookie: RefreshCookieService,
  ) {}

  @Public()
  @Post("register")
  @ApiOperation({
    summary: "Registro local con email y contrasena",
    description:
      "Crea la cuenta inactiva (emailVerified=false) y encola el email de verificacion (RF-1/RF-2).",
  })
  @ApiBody({ schema: registerRequestJsonSchema })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Cuenta creada e inactiva; email de verificacion encolado",
    schema: registerResponseJsonSchema,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Payload invalido (validation_failed)",
    schema: apiErrorResponseJsonSchema,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: "Mensaje generico identico para cualquier email ya registrado",
    schema: apiErrorResponseJsonSchema,
  })
  register(
    @Body(new ZodValidationPipe(RegisterRequestSchema)) dto: RegisterRequest,
  ): Promise<RegisterResponse> {
    return this.authService.register(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("verify-email")
  @ApiOperation({
    summary: "Consume un token de verificacion de email",
    description:
      "Token de un solo uso valido 24 h; marca el email verificado e inicia sesion (RF-3): access token en cuerpo y refresh en cookie httpOnly.",
  })
  @ApiBody({ schema: verifyEmailRequestJsonSchema })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Email verificado y sesion iniciada; Set-Cookie rt (httpOnly)",
    schema: verifyEmailResponseJsonSchema,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Token invalido, ya usado o expirado",
    schema: apiErrorResponseJsonSchema,
  })
  async verifyEmail(
    @Body(new ZodValidationPipe(VerifyEmailRequestSchema)) dto: VerifyEmailRequest,
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<VerifyEmailResponse> {
    const issued = await this.authService.verifyEmail(dto.token, {
      userAgent:
        typeof request.headers["user-agent"] === "string"
          ? request.headers["user-agent"]
          : undefined,
      ip: request.ip,
    });
    this.refreshCookie.set(reply, issued.refreshToken);
    return { accessToken: issued.accessToken, expiresIn: issued.expiresIn };
  }

  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Post("resend-verification")
  @ApiOperation({
    summary: "Reenvia el email de verificacion",
    description:
      "Responde 202 siempre para no enumerar cuentas; invalida enlaces anteriores sin usar. El rate limit por IP llega con T8 (@nestjs/throttler).",
  })
  @ApiBody({ schema: resendVerificationRequestJsonSchema })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: "Aceptado (con o sin cuenta asociada)",
    schema: acceptedResponseJsonSchema,
  })
  async resendVerification(
    @Body(new ZodValidationPipe(ResendVerificationRequestSchema)) dto: ResendVerificationRequest,
  ): Promise<AcceptedResponse> {
    await this.authService.resendVerification(dto.email);
    return { accepted: true };
  }

  /** Endpoint dummy protegido para validar el guard global (T5). */
  @Get("me")
  @ApiOperation({ summary: "Devuelve el payload del access token actual" })
  me(@Req() request: RequestWithUser): { user: AccessTokenPayload | null } {
    return { user: request.user ?? null };
  }
}
