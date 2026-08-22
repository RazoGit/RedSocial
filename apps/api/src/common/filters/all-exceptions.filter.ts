import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";

interface ReplyLike {
  status(code: number): { send(body: unknown): unknown };
}

interface RequestLike {
  url?: string;
}

/**
 * Filtro global de errores: normaliza toda respuesta de error a la forma
 * del contrato ApiErrorResponseSchema (statusCode, message, error?, path, timestamp).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<ReplyLike>();
    const request = ctx.getRequest<RequestLike>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let error: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === "string") {
        message = res;
      } else if (typeof res === "object" && res !== null) {
        const body = res as Record<string, unknown>;
        const rawMessage = body.message ?? exception.message;
        message = Array.isArray(rawMessage) ? rawMessage.join(", ") : String(rawMessage);
        if (typeof body.error === "string") error = body.error;
      }
    } else if (exception instanceof Error) {
      console.error("[unhandled-exception]", exception);
    }

    response.status(statusCode).send({
      statusCode,
      message,
      ...(error ? { error } : {}),
      path: request.url ?? "",
      timestamp: new Date().toISOString(),
    });
  }
}
