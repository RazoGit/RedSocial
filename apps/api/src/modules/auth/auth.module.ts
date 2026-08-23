import { Module } from "@nestjs/common";

import { EmailModule } from "../email/email.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import {
  LoginRateLimiterService,
  redisClientProvider,
} from "./services/login-rate-limiter.service";
import { CsrfCookieService } from "./services/csrf-cookie.service";
import { OauthClientService } from "./services/oauth-client.service";
import { OauthConfigService } from "./services/oauth-config.service";
import { OauthStateService } from "./services/oauth-state.service";
import { RefreshCookieService } from "./services/refresh-cookie.service";
import { PasswordService } from "./services/password.service";
import { SessionsService } from "./sessions.service";
import { TokensService } from "./tokens.service";

@Module({
  imports: [EmailModule],
  controllers: [AuthController],
  providers: [
    redisClientProvider,
    TokensService,
    SessionsService,
    AuthService,
    PasswordService,
    RefreshCookieService,
    CsrfCookieService,
    LoginRateLimiterService,
    OauthConfigService,
    OauthClientService,
    OauthStateService,
  ],
  exports: [TokensService],
})
export class AuthModule {}
