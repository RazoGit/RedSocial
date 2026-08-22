import { Controller, Get, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import type { AccessTokenPayload } from "./tokens.service";

interface AuthedRequest {
  user?: AccessTokenPayload;
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  /** Endpoint dummy protegido para validar el guard global (T5). */
  @Get("me")
  @ApiOperation({ summary: "Devuelve el payload del access token actual" })
  me(@Req() request: AuthedRequest): { user: AccessTokenPayload | null } {
    return { user: request.user ?? null };
  }
}
