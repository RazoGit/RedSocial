"use client";

import { useEffect, useState } from "react";
import { MeProfileResponseSchema } from "@redsocial/contracts";
import type { MeProfileResponse } from "@redsocial/contracts";

import { getJson } from "@/lib/api-client";

/**
 * Carga el perfil del usuario autenticado (GET /users/me) y lo expone a
 * componentes client. Permite que cada cuenta muestre SUS datos reales en
 * lugar del mock.
 */
export function useMe(): { me: MeProfileResponse | undefined } {
  const [me, setMe] = useState<MeProfileResponse>();

  useEffect(() => {
    let cancelled = false;
    getJson("/users/me", MeProfileResponseSchema)
      .then((profile) => {
        if (!cancelled) setMe(profile);
      })
      .catch(() => {
        // Sin sesion: el layout (app) ya protege estas rutas.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { me };
}
