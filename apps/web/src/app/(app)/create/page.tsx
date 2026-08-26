"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X, ArrowLeft, LoaderCircle } from "lucide-react";
import { PostResponseSchema, PresignPostMediaResponseSchema } from "@redsocial/contracts";

import { Button } from "@/components/ui/button";
import { ApiError, postJson, putBinary } from "@/lib/api-client";

const MAX_TEXT = 500;
const MAX_IMAGES = 4;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

interface PreviewImage {
  file: File;
  preview: string;
}

export default function CreatePostPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [images, setImages] = useState<PreviewImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const remaining = MAX_IMAGES - images.length;
      const valid = Array.from(files)
        .filter((f) => ACCEPTED.includes(f.type) && f.size <= 5 * 1024 * 1024)
        .slice(0, remaining);
      setImages((prev) => [
        ...prev,
        ...valid.map((file) => ({ file, preview: URL.createObjectURL(file) })),
      ]);
    },
    [images.length],
  );

  const removeImage = (index: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index]!.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0) return;
    setSaving(true);
    setError(undefined);

    try {
      const mediaKeys: string[] = [];

      for (const img of images) {
        const presign = await postJson(
          "/posts/media/presign",
          { contentType: img.file.type, sizeBytes: img.file.size },
          PresignPostMediaResponseSchema,
        );
        await putBinary(presign.uploadUrl, img.file, img.file.type);
        mediaKeys.push(presign.key);
      }

      const post = await postJson(
        "/posts",
        { text: trimmed || undefined, mediaKeys: mediaKeys.length > 0 ? mediaKeys : undefined },
        PostResponseSchema,
      );

      images.forEach((img) => URL.revokeObjectURL(img.preview));
      router.push(`/post/${post.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "No se pudo crear la publicacion.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="size-10">
          <a href="/feed" aria-label="Volver">
            <ArrowLeft className="size-5" />
          </a>
        </Button>
        <h1 className="text-sm font-semibold">Nueva publicacion</h1>
      </header>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_TEXT}
        placeholder="Que estas pensando?"
        className="border-input bg-card/40 focus-visible:border-primary focus-visible:ring-primary/30 min-h-[120px] w-full rounded-xl border p-4 text-sm outline-none focus-visible:ring-2"
      />

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label="Adjuntar imagen"
          onClick={() => inputRef.current?.click()}
          disabled={images.length >= MAX_IMAGES}
        >
          <ImagePlus className="size-5" />
        </Button>
        <span className="text-muted-foreground text-xs">
          {text.length}/{MAX_TEXT}
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {images.map((img, i) => (
            <div
              key={i}
              className="border-border relative aspect-square overflow-hidden rounded-xl border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.preview}
                alt={`Vista previa ${i + 1}`}
                className="size-full object-cover"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 size-6"
                aria-label="Quitar imagen"
                onClick={() => removeImage(i)}
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <Button
        onClick={handleSubmit}
        disabled={saving || (!text.trim() && images.length === 0)}
        className="w-full"
      >
        {saving ? (
          <span className="flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" /> Publicando...
          </span>
        ) : (
          "Publicar"
        )}
      </Button>
    </div>
  );
}
