import { expect, test } from "@playwright/test";

import { waitForToken } from "./helpers/mailpit";

/**
 * Flujo completo de autenticacion local (spec 001, RF-1 a RF-12):
 * registro -> verificacion por email -> login -> recuperacion de contrasena.
 * Serial: cada paso continua el viaje del mismo usuario.
 */
test.describe.serial("flujo completo de autenticacion", () => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const passwordInicial = "ClaveE2e123";
  const passwordNueva = "ClaveNueva456";

  const tokenPattern = /[?&]token=([A-Za-z0-9_-]{32,128})/;

  test("registro pide verificar el correo", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contrasena").fill(passwordInicial);
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    await expect(page.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
  });

  test("el enlace del correo verifica la cuenta y entra al feed con sesion", async ({ page }) => {
    const token = await waitForToken({
      to: email,
      subjectIncludes: "Verifica tu cuenta",
      pattern: tokenPattern,
    });

    await page.goto(`/verify-email?token=${token}`);
    await page.waitForURL("**/feed");

    // Sesion emitida por la verificacion (T7): el feed queda accesible.
    await expect(page.getByRole("tablist", { name: "Selector de feed" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Inicio" })).toBeVisible();
  });

  test("login con contrasena incorrecta muestra el error del contrato (RF-4)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contrasena").fill("Incorrecta999");
    await page.getByRole("button", { name: "Iniciar sesion" }).click();

    await expect(page.getByText("Email o contrasena incorrectos")).toBeVisible();
  });

  test("login correcto entra al feed", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contrasena").fill(passwordInicial);
    await page.getByRole("button", { name: "Iniciar sesion" }).click();

    await page.waitForURL("**/feed");
    await expect(page.getByRole("tablist", { name: "Selector de feed" })).toBeVisible();
  });

  test("recuperar contrasena permite restablecer y entrar (RF-11, RF-12)", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Enviar enlace" }).click();

    const panel = page.getByRole("heading", { name: "Revisa tu correo" });
    await expect(panel).toBeVisible();

    const token = await waitForToken({
      to: email,
      subjectIncludes: "Recupera tu contrasena",
      pattern: tokenPattern,
    });

    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel("Nueva contrasena").fill(passwordNueva);
    await page.getByLabel("Confirmar contrasena").fill(passwordNueva);
    await page.getByRole("button", { name: "Restablecer contrasena" }).click();

    await expect(page.getByRole("heading", { name: "Contrasena restablecida" })).toBeVisible();

    await page.getByRole("button", { name: "Ir a iniciar sesion" }).click();
    await page.waitForURL("**/login");

    // La contrasena anterior quedo invalidada; solo la nueva abre sesion.
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contrasena").fill(passwordNueva);
    await page.getByRole("button", { name: "Iniciar sesion" }).click();

    await page.waitForURL("**/feed");
    await expect(page.getByRole("tablist", { name: "Selector de feed" })).toBeVisible();
  });
});
