"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user";
import { currentUser } from "@/lib/mock-data";

const MAX_LENGTH = 500;

export default function CreatePage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [images, setImages] = useState<number[]>([]);

  const remaining = MAX_LENGTH - text.length;
  const canPublish = text.trim().length > 0 && remaining >= 0;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Nueva publicacion</h1>
        <Button size="sm" disabled={!canPublish} onClick={() => router.push("/feed")}>
          Publicar
        </Button>
      </header>

      <div className="flex gap-3">
        <UserAvatar name={currentUser.name} className="size-10" />
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Que esta pasando?"
          aria-label="Texto de la publicacion"
          rows={5}
          className="border-input focus-visible:border-primary focus-visible:ring-primary/30 bg-card/40 w-full flex-1 resize-none rounded-xl border p-3 text-base md:text-sm outline-none focus-visible:ring-2"
        />
      </div>

      {images.length > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {images.map((image) => (
            <div
              key={image}
              className="bg-primary/10 border-primary/30 relative aspect-square rounded-lg border"
            >
              <ImagePlus className="text-primary/50 absolute inset-0 m-auto size-6" />
              <button
                type="button"
                aria-label="Quitar imagen"
                onClick={() => setImages((current) => current.filter((item) => item !== image))}
                className="bg-background/80 absolute top-1 right-1 rounded-full p-0.5"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="border-border flex items-center justify-between border-t pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-primary hover:bg-primary/10 hover:text-primary"
          disabled={images.length >= 4}
          onClick={() => setImages((current) => [...current, Date.now()])}
        >
          <ImagePlus className="size-4" />
          Imagen
        </Button>
        <span
          className={remaining < 0 ? "text-destructive text-xs" : "text-muted-foreground text-xs"}
        >
          {remaining}
        </span>
      </div>
    </div>
  );
}
