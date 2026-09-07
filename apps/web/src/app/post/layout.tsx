import type { ReactNode } from "react";

import { RealtimeProvider } from "@/components/realtime/realtime-provider";

export default function PostLayout({ children }: { children: ReactNode }) {
  return <RealtimeProvider>{children}</RealtimeProvider>;
}
