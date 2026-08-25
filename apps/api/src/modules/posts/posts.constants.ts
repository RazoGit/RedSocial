/** Cola BullMQ para procesamiento multimedia de posts (spec 004). */
export const POST_MEDIA_QUEUE = "post-media";

/** Token DI del cliente S3 (reutiliza el de UsersModule). */
export const S3_CLIENT = "S3_CLIENT";

/** Payload del job que genera thumbnail + blurhash de imagen de post. */
export interface PostMediaProcessPayload {
  postId: string;
  mediaId: string;
  /** Key S3 del original que el cliente debio subir con el PUT firmado. */
  key: string;
}

/** Validez de la URL PUT pre-firmada entregada al cliente. */
export const POST_PRESIGN_TTL_SECONDS = 900;

/** Tamano maximo del lado mas largo del thumbnail (RF-2). */
export const POST_THUMB_MAX_SIZE = 1200;

/** Reintentos del job si el objeto aun no aparece o falla el pipeline. */
export const POST_MEDIA_JOB_ATTEMPTS = 3;
