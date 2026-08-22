import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

export interface ZodIssueSummary {
  path: string;
  message: string;
}

/**
 * Valida el valor entrante contra un esquema Zod de @redsocial/contracts.
 * Los esquemas compartidos se declaran .strict() para rechazar campos
 * desconocidos (equivalente a whitelist + forbidNonWhitelisted).
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      const issues: ZodIssueSummary[] = parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      }));
      throw new BadRequestException({ message: "validation_failed", issues });
    }
    return parsed.data;
  }
}
