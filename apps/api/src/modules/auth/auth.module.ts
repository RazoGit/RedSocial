import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { SessionsService } from "./sessions.service";
import { TokensService } from "./tokens.service";

@Module({
  controllers: [AuthController],
  providers: [TokensService, SessionsService],
  exports: [TokensService],
})
export class AuthModule {}
