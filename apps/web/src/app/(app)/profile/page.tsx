import type { Metadata } from "next";

import { ProfileTabs } from "@/components/profile/profile-tabs";
import { ProfileEditor } from "@/components/profile/profile-editor";

export const metadata: Metadata = {
  title: "Editar perfil | R",
};

export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="text-center">
        <h1 className="text-xl font-bold">Editar perfil</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Tu username se puede cambiar una vez sin coste; luego cada 14 dias.
        </p>
      </header>
      <ProfileEditor />
      <ProfileTabs />
    </div>
  );
}
