import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { RegisterRequestSchema } from "@redsocial/contracts";
import { AuthService } from "./auth.service";
import {
  apiErrorResponseJsonSchema,
  registerRequestJsonSchema,
  registerResponseJsonSchema,
  type RegisterRequest,
  type RegisterResponse,
} from "./dto/register.dto";
import type { AccessTokenPayload } from "./tokens.service";

interface AuthedRequest {
  user?: AccessTokenPayload;
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("register")
  @ApiOperation({
    summary: "Registro local con email y contrasena",
    description:
      "Crea la cuenta inactiva (emailVerified=false) y encola el email de verificacion (RF-1/RF-2).",
  })
  @ApiBody({ schema: registerRequestJsonSchema })
  @ApiResponse({
    status: 201,
    description: "Cuenta creada e inactiva; email de verificacion encolado",
    schema: registerResponseJsonSchema,
  })
  @ApiResponse({
    status: 400,
    description: "Payload invalido (validation_failed)",
    schema: apiErrorResponseJsonSchema,
  })
  @ApiResponse({
    status: 409,
    description: "Mensaje generico identico para cualquier email ya registrado",
    schema: apiErrorResponseJsonSchema,
  })
  register(
    @Body(new ZodValidationPipe(RegisterRequestSchema)) dto: RegisterRequest,
  ): Promise<RegisterResponse> {
    return this.authService.register(dto);
  }

  /** Endpoint dummy protegido para validar el guard global (T5). */
  @Get("me")
  @ApiOperation({ summary: "Devuelve el payload del access token actual" })
  me(@Req() request: AuthedRequest): { user: AccessTokenPayload | null } {
    return { user: request.user ?? null };
  }
}
