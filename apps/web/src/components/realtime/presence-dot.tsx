"use client";

import { cn } from "@/lib/utils";
import { usePresence } from "@/components/realtime/realtime-provider";

/**
 * Punto verde de presencia online (spec 007/T22). Colocar dentro de un
 * contenedor relativo junto al avatar del usuario a observar.
 */
export function PresenceDot({
  userId,
  className,
  fallbackClassName,
}: {
  userId: string | undefined;
  className?: string;
  fallbackClassName?: string;
}) {
  const online = usePresence(userId);
  if (!userId) return null;

  return (
    <span
      aria-label={online ? "En linea" : "Desconectado"}
      className={cn(
        "absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-background bg-muted",
        online && "bg-emerald-500",
        className,
        !online && fallbackClassName,
      )}
    />
  );
}
