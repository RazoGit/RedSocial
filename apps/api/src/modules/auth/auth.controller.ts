import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  HttpException,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  LoginRequestSchema,
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
  loginRequestJsonSchema,
  loginResponseJsonSchema,
  refreshResponseJsonSchema,
  registerRequestJsonSchema,
  registerResponseJsonSchema,
  resendVerificationRequestJsonSchema,
  verifyEmailRequestJsonSchema,
  verifyEmailResponseJsonSchema,
  type LoginRequest,
  type LoginResponse,
  type RefreshResponse,
  type RegisterRequest,
  type RegisterResponse,
  type ResendVerificationRequest,
  type AcceptedResponse,
  type VerifyEmailRequest,
  type VerifyEmailResponse,
} from "./dto/auth.dto";
import type { SessionMeta } from "./sessions.service";
import { CsrfCookieService, CSRF_COOKIE_NAME } from "./services/csrf-cookie.service";
import { LoginRateLimiterService } from "./services/login-rate-limiter.service";
import { RefreshCookieService, REFRESH_COOKIE_NAME } from "./services/refresh-cookie.service";
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
    private readonly csrfCookie: CsrfCookieService,
    private readonly loginLimiter: LoginRateLimiterService,
  ) {}

  /** RF-6 (registro de sesion): UA e IP del cliente para la fila de sesion. */
  private metaFrom(request: FastifyRequest): SessionMeta {
    return {
      userAgent:
        typeof request.headers["user-agent"] === "string"
          ? request.headers["user-agent"]
          : undefined,
      ip: request.ip,
    };
  }

  private cookieFrom(request: FastifyRequest, name: string): string | undefined {
    const cookies = (request as unknown as { cookies?: Record<string, string | undefined> })
      .cookies;
    return cookies?.[name];
  }

  /** Emision de sesion: cookies rt+csrf y cuerpo con access/csrfToken. */
  private respondWithSession(
    reply: FastifyReply,
    issued: {
      accessToken: string;
      expiresIn: number;
      refreshToken: string;
      csrfToken: string;
    },
  ): { accessToken: string; expiresIn: number; csrfToken: string } {
    this.refreshCookie.set(reply, issued.refreshToken);
    this.csrfCookie.set(reply, issued.csrfToken);
    return {
      accessToken: issued.accessToken,
      expiresIn: issued.expiresIn,
      csrfToken: issued.csrfToken,
    };
  }

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
    const issued = await this.authService.verifyEmail(dto.token, this.metaFrom(request));
    return this.respondWithSession(reply, issued);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("login")
  @ApiOperation({
    summary: "Inicio de sesion local con email y contrasena",
    description:
      "RF-4: permite login aunque el email no este verificado. RF-5: tras 5 fallos por IP en 15 min responde 429 con Retry-After. Emite access token en cuerpo y refresh en cookie httpOnly (RF-6).",
  })
  @ApiBody({ schema: loginRequestJsonSchema })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Sesion iniciada; Set-Cookie rt (httpOnly)",
    schema: loginResponseJsonSchema,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Payload invalido (validation_failed)",
    schema: apiErrorResponseJsonSchema,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Mensaje generico identico para email inexistente o contrasena incorrecta",
    schema: apiErrorResponseJsonSchema,
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: "IP bloqueada temporalmente por intentos fallidos repetidos (RF-5)",
    schema: apiErrorResponseJsonSchema,
  })
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) dto: LoginRequest,
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    const retryAfter = await this.loginLimiter.secondsUntilReset(request.ip);
    if (retryAfter > 0) {
      reply.header("Retry-After", String(retryAfter));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Demasiados intentos fallidos; espera antes de reintentar",
          error: "Too Many Requests",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let issued;
    try {
      issued = await this.authService.login(dto, this.metaFrom(request));
    } catch (error) {
      // Solo los fallos de credenciales alimentan el contador de RF-5.
      if (error instanceof UnauthorizedException) {
        await this.loginLimiter.registerFailure(request.ip);
      }
      throw error;
    }

    await this.loginLimiter.reset(request.ip);
    return this.respondWithSession(reply, issued);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  @ApiOperation({
    summary: "Renueva la sesion rotando el refresh token de la cookie",
    description:
      "RF-6/RF-7/RF-8: requiere cookie rt httpOnly y header X-CSRF-Token igual al valor de la cookie csrf_token (double-submit, D6). Rota el refresh: el anterior queda invalido y reutilizarlo revoca toda la familia con 401. Expiracion deslizante 30 d con tope de 90 d.",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Sesion renovada; nuevas cookies rt y csrf_token",
    schema: refreshResponseJsonSchema,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Cookie ausente, token invalido, expirado o reutilizado (familia revocada)",
    schema: apiErrorResponseJsonSchema,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "Header X-CSRF-Token ausente o distinto de la cookie csrf_token",
    schema: apiErrorResponseJsonSchema,
  })
  async refresh(
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<RefreshResponse> {
    const csrfHeader = request.headers["x-csrf-token"];
    const headerValue = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
    const cookieValue = this.cookieFrom(request, CSRF_COOKIE_NAME);
    if (
      typeof headerValue !== "string" ||
      headerValue.length === 0 ||
      headerValue !== cookieValue
    ) {
      throw new ForbiddenException("csrf_invalid");
    }

    const rawRefresh = this.cookieFrom(request, REFRESH_COOKIE_NAME);
    if (!rawRefresh) {
      throw new UnauthorizedException("missing_refresh_cookie");
    }

    try {
      const issued = await this.authService.refresh(rawRefresh);
      return this.respondWithSession(reply, issued);
    } catch (error) {
      this.refreshCookie.clear(reply);
      this.csrfCookie.clear(reply);
      throw error;
    }
  }

  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Post("resend-verification")
  @ApiOperation({
    summary: "Reenvia el email de verificacion",
    description:
      "Responde 202 siempre para no enumerar cuentas; invalida enlaces anteriores sin usar. El rate limit por IP se anade con forgot-password en T14.",
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
