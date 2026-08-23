import { Module, forwardRef } from "@nestjs/common";

import { EmailModule } from "../email/email.module";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import {
  LoginRateLimiterService,
  redisClientProvider,
} from "./services/login-rate-limiter.service";
import { CsrfCookieService } from "./services/csrf-cookie.service";
import { OauthClientService } from "./services/oauth-client.service";
import { OauthConfigService } from "./services/oauth-config.service";
import { OauthService } from "./services/oauth.service";
import { OauthStateService } from "./services/oauth-state.service";
import { RefreshCookieService } from "./services/refresh-cookie.service";
import { GithubOauthStrategy } from "./strategies/github.oauth";
import { GoogleOauthStrategy } from "./strategies/google.oauth";
import { PasswordService } from "./services/password.service";
import { SessionsService } from "./sessions.service";
import { TokensService } from "./tokens.service";

@Module({
  imports: [EmailModule, forwardRef(() => UsersModule)],
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
    OauthService,
    GoogleOauthStrategy,
    GithubOauthStrategy,
  ],
  exports: [TokensService],
})
export class AuthModule {}
