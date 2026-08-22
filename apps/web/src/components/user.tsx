import { BadgeCheck } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name: string;
  className?: string;
}

export function UserAvatar({ name, className }: UserAvatarProps) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Avatar className={className}>
      <AvatarFallback className="bg-primary/15 font-semibold text-primary">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

interface VerifiedMarkProps {
  className?: string;
}

export function VerifiedMark({ className }: VerifiedMarkProps) {
  return (
    <BadgeCheck
      aria-label="Cuenta verificada"
      className={cn("size-4 fill-primary text-background", className)}
    />
  );
}
