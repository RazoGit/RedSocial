import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { HealthResponse, ReadinessResponse } from "@redsocial/contracts";

import { Public } from "../../common/decorators/public.decorator";

@ApiTags("health")
@Controller()
export class HealthController {
  @Public()
  @Get("health")
  @ApiOperation({ summary: "Liveness probe" })
  getHealth(): HealthResponse {
    return {
      status: "ok",
      service: "redsocial-api",
      uptime: process.uptime(),
    };
  }

  @Public()
  @Get("ready")
  @ApiOperation({ summary: "Readiness probe" })
  getReady(): ReadinessResponse {
    return {
      status: "ok",
      checks: { api: "up" },
    };
  }
}
