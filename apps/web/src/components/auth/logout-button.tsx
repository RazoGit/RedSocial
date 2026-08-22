"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LogoutButtonProps {
  mode?: "icon" | "full";
  className?: string;
}

export function LogoutButton({ mode = "full", className }: LogoutButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const logout = () => {
    setPending(true);
    setTimeout(() => router.push("/"), 400);
  };

  if (mode === "icon") {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Cerrar sesion"
        title="Cerrar sesion"
        disabled={pending}
        onClick={logout}
        className={cn(
          "text-muted-foreground hover:bg-destructive/10 hover:text-destructive size-9",
          className,
        )}
      >
        <LogOut className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={logout}
      className={cn(
        "text-muted-foreground hover:bg-destructive/10 w-full hover:border-destructive/40 hover:text-destructive",
        className,
      )}
    >
      <LogOut className="size-4" />
      {pending ? "Saliendo..." : "Cerrar sesion"}
    </Button>
  );
}
