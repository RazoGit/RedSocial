import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { HealthResponse, ReadinessResponse } from "@redsocial/contracts";

@ApiTags("health")
@Controller()
export class HealthController {
  @Get("health")
  @ApiOperation({ summary: "Liveness probe" })
  getHealth(): HealthResponse {
    return {
      status: "ok",
      service: "redsocial-api",
      uptime: process.uptime(),
    };
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness probe" })
  getReady(): ReadinessResponse {
    return {
      status: "ok",
      checks: { api: "up" },
    };
  }
}
