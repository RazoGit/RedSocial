/**
 * Cliente minimo de la API de Mailpit para extraer tokens de los correos
 * que envia el backend en dev (SMTP localhost:1025 -> UI/API :8025).
 */

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

interface MailpitMessageSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

interface MailpitMessageDetail {
  HTML?: string;
  Text?: string;
}

export async function waitForToken(options: {
  to: string;
  subjectIncludes: string;
  pattern: RegExp;
  timeoutMs?: number;
}): Promise<string> {
  const deadline = Date.now() + (options.timeoutMs ?? 20_000);

  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`);
    if (res.ok) {
      const data = (await res.json()) as { messages?: MailpitMessageSummary[] };
      const summary = (data.messages ?? []).find(
        (message) =>
          message.To?.some((destino) => destino.Address === options.to) &&
          message.Subject?.includes(options.subjectIncludes),
      );
      if (summary) {
        const detail = (await (
          await fetch(`${MAILPIT_URL}/api/v1/message/${encodeURIComponent(summary.ID)}`)
        ).json()) as MailpitMessageDetail;
        const match = `${detail.HTML ?? ""} ${detail.Text ?? ""}`.match(options.pattern);
        if (match) return match[1];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Mailpit: no llego un correo a ${options.to} con asunto "${options.subjectIncludes}"`,
  );
}
