import { Module } from "@nestjs/common";

import { presenceRedisClientProvider, PresenceService } from "./presence.service";

/**
 * Presence basica (spec 007). Exporta PresenceService para consumo desde
 * el gateway (realtime) y desde el perfil publico (users).
 */
@Module({
  providers: [presenceRedisClientProvider, PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
