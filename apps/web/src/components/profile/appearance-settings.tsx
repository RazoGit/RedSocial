"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const options = [
  { value: "light" as const, label: "Claro", icon: Sun },
  { value: "dark" as const, label: "Oscuro", icon: Moon },
  { value: "system" as const, label: "Sistema", icon: Monitor },
] as const;

export function AppearanceSettings() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const current = resolvedTheme === "dark" ? "dark" : "light";

  return (
    <section className="flex flex-col gap-3">
      <Label className="text-base font-semibold">Apariencia</Label>
      <p className="text-muted-foreground text-sm">
        Elige entre el tema claro, oscuro o seguir las preferencias de tu sistema.
      </p>
      <div className="flex gap-2">
        {options.map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            variant={value === "system" ? "outline" : current === value ? "default" : "outline"}
            size="sm"
            onClick={() => setTheme(value)}
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </Button>
        ))}
      </div>
    </section>
  );
}
