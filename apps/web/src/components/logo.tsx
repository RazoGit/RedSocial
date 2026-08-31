import Image from "next/image";

import { cn } from "@/lib/utils";
import IconSvg from "@/assets/icon.svg";

export function Logo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <Image
      src={IconSvg}
      alt="R"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      priority
    />
  );
}
