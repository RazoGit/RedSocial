/** Cola BullMQ para procesamiento multimedia inline (spec 002, plan §4). */
export const MEDIA_QUEUE = "media";

/** Token DI del cliente S3 (MinIO en dev, R2 en prod). */
export const S3_CLIENT = "S3_CLIENT";

/** Payload del job que genera thumbnail + blurhash del avatar (RF-4). */
export interface AvatarProcessPayload {
  userId: string;
  /** Key S3 del original que el cliente debio subir con el PUT firmado. */
  key: string;
}

export type MediaJobPayload = AvatarProcessPayload;

/** Validez de la URL PUT pre-firmada entregada al cliente. */
export const AVATAR_PRESIGN_TTL_SECONDS = 900;

/** Tamano del thumbnail cuadrado generado por el worker (RF-4). */
export const AVATAR_THUMB_SIZE = 256;

/** Espera antes de procesar, para dar tiempo a la subida del cliente. */
export const AVATAR_PROCESS_DELAY_MS = 15_000;

/** Reintentos del job si el objeto aun no aparece o falla el pipeline. */
export const AVATAR_JOB_ATTEMPTS = 3;
