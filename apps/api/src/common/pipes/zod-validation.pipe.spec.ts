import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ZodValidationPipe } from "./zod-validation.pipe";

const schema = z
  .object({
    email: z.email(),
    password: z.string().min(10),
  })
  .strict();

describe("ZodValidationPipe", () => {
  const pipe = new ZodValidationPipe(schema);

  it("devuelve el valor parseado cuando el payload es valido", () => {
    const value = pipe.transform({ email: "ana@example.com", password: "1234567890" });
    expect(value).toEqual({ email: "ana@example.com", password: "1234567890" });
  });

  it("lanza BadRequestException con validation_failed para payloads invalidos", () => {
    let thrown: unknown;
    try {
      pipe.transform({ email: "no-es-un-email", password: "corta" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const badRequest = thrown as BadRequestException;
    expect(badRequest.getResponse()).toMatchObject({
      message: "validation_failed",
      issues: expect.any(Array),
    });
  });

  it("rechaza campos desconocidos en esquemas strict", () => {
    expect(() => pipe.transform({ email: "a@b.com", password: "1234567890", extra: true })).toThrow(
      BadRequestException,
    );
  });

  it("rechaza payloads que no son objetos", () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
    expect(() => pipe.transform("texto")).toThrow(BadRequestException);
  });
});
