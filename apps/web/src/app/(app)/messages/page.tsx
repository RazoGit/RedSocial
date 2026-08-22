import { Mail } from "lucide-react";

export default function MessagesPage() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
        <Mail className="size-6" />
      </div>
      <h1 className="text-lg font-semibold">Tus mensajes</h1>
      <p className="text-muted-foreground max-w-xs text-sm">
        Cuando alguien te escriba, la conversacion aparecera aqui.
      </p>
    </div>
  );
}
