export const EMAIL_QUEUE = "email";

/** Token de inyeccion del transporter SMTP (nodemailer). */
export const MAIL_TRANSPORTER = "MAIL_TRANSPORTER";

export interface VerificationEmailPayload {
  to: string;
  verifyUrl: string;
}
