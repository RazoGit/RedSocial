import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AccessTokenPayload } from "../../modules/auth/tokens.service";
import { TokensService } from "../../modules/auth/tokens.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

interface RequestWithUser {
  headers: Record<string, string | string[] | undefined>;
  user?: AccessTokenPayload;
}

function extractBearerToken(request: RequestWithUser): string | undefined {
  const header = request.headers.authorization;
  if (typeof header !== "string") return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1];
}

/**
 * Guard global: exige access token JWT valido (Authorization: Bearer).
 * Las rutas marcadas con @Public() lo omiten.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokensService: TokensService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = extractBearerToken(request);
    if (!token) throw new UnauthorizedException("missing_bearer_token");

    try {
      request.user = await this.tokensService.verifyAccessToken(token);
      return true;
    } catch {
      throw new UnauthorizedException("invalid_access_token");
    }
  }
}

/**
 * Variante opcional: intenta autenticar pero nunca bloquea la ruta.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly tokensService: TokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = extractBearerToken(request);
    if (token) {
      try {
        request.user = await this.tokensService.verifyAccessToken(token);
      } catch {
        request.user = undefined;
      }
    }
    return true;
  }
}
