export const EMAIL_QUEUE = "email";

/** Token de inyeccion del transporter SMTP (nodemailer). */
export const MAIL_TRANSPORTER = "MAIL_TRANSPORTER";

export interface VerificationEmailPayload {
  to: string;
  verifyUrl: string;
}

/** RF-11: enlace de recuperacion valido 1 h. */
export interface PasswordResetEmailPayload {
  to: string;
  resetUrl: string;
}

/** RF-12: aviso de que la contrasena cambio (todas las sesiones revocadas). */
export interface PasswordChangedEmailPayload {
  to: string;
}

export type EmailPayload =
  VerificationEmailPayload | PasswordResetEmailPayload | PasswordChangedEmailPayload;
