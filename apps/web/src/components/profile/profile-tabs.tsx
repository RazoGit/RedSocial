"use client";

import { useState } from "react";
import { Bookmark, MessageCircle } from "lucide-react";

import { coverGradient, mockPosts, profileStats } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type ProfileTab = "publicaciones" | "respuestas" | "guardados";

const tabs: { value: ProfileTab; label: string }[] = [
  { value: "publicaciones", label: "Publicaciones" },
  { value: "respuestas", label: "Respuestas" },
  { value: "guardados", label: "Guardados" },
];

function EmptyTab({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Bookmark;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground max-w-xs text-sm">{description}</p>
    </div>
  );
}

export function ProfileTabs() {
  const [tab, setTab] = useState<ProfileTab>("publicaciones");

  return (
    <section className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Contenido del perfil"
        className="border-border grid grid-cols-3 border-b"
      >
        {tabs.map((item) => (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={tab === item.value}
            onClick={() => setTab(item.value)}
            className={cn(
              "border-b-2 pb-3 text-sm font-medium transition-colors",
              tab === item.value
                ? "border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "publicaciones" ? (
        <>
          <dl className="grid grid-cols-3 gap-2 py-1 text-center">
            <div>
              <dt className="text-muted-foreground order-last text-xs">Publicaciones</dt>
              <dd className="text-lg font-bold">{profileStats.posts}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground order-last text-xs">Seguidores</dt>
              <dd className="text-lg font-bold">{profileStats.followers}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground order-last text-xs">Siguiendo</dt>
              <dd className="text-lg font-bold">{profileStats.following}</dd>
            </div>
          </dl>
          <div className="grid grid-cols-3 gap-1.5">
            {mockPosts.map((post) => (
              <div
                key={post.id}
                className="border-border relative aspect-square overflow-hidden rounded-lg border"
              >
                <div
                  className="absolute inset-0"
                  style={{ backgroundImage: coverGradient(post.hue) }}
                />
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center select-none"
                >
                  <span className="text-primary/20 text-5xl font-bold">R</span>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {tab === "respuestas" ? (
        <EmptyTab
          icon={MessageCircle}
          title="Sin respuestas todavia"
          description="Cuando respondas publicaciones apareceran aqui."
        />
      ) : null}

      {tab === "guardados" ? (
        <EmptyTab
          icon={Bookmark}
          title="Nada guardado aun"
          description="Guarda publicaciones con el marcador para verlas despues."
        />
      ) : null}
    </section>
  );
}
