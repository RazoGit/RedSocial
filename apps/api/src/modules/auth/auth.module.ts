import { Module } from "@nestjs/common";

import { EmailModule } from "../email/email.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordService } from "./services/password.service";
import { SessionsService } from "./sessions.service";
import { TokensService } from "./tokens.service";

@Module({
  imports: [EmailModule],
  controllers: [AuthController],
  providers: [TokensService, SessionsService, AuthService, PasswordService],
  exports: [TokensService],
})
export class AuthModule {}
