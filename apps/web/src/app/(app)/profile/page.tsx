import { Share2 } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { Button } from "@/components/ui/button";
import { UserAvatar, VerifiedMark } from "@/components/user";
import { currentUser } from "@/lib/mock-data";

export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-3 text-center">
        <UserAvatar
          name={currentUser.name}
          className="ring-primary/70 size-20 ring-2 ring-offset-4 ring-offset-background"
        />
        <div>
          <h1 className="flex items-center justify-center gap-1.5 text-xl font-bold">
            {currentUser.name}
            <VerifiedMark className="size-5" />
          </h1>
          <p className="text-muted-foreground text-sm">@{currentUser.handle}</p>
        </div>
        <p className="text-muted-foreground max-w-sm text-sm">
          Conecta. Comparte. Revoluciona. Construyendo la red social diferente.
        </p>
        <div className="flex w-full max-w-xs gap-2">
          <Button variant="outline" size="sm" className="flex-1">
            Editar perfil
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Compartir perfil"
            className="border-primary/60 text-primary hover:bg-primary/10 hover:text-primary"
          >
            <Share2 className="size-4" />
          </Button>
        </div>
        <LogoutButton className="max-w-xs" />
      </header>

      <ProfileTabs />
    </div>
  );
}
