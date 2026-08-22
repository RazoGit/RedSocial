import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 p-8">
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo size={56} />
        <div>
          <h1 className="text-4xl font-bold tracking-tight">RedSocial</h1>
          {/* <p className="mt-2 text-muted-foreground">Next.js + Tailwind v4 + shadcn/ui · Fase 0</p> */}
        </div>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="flex flex-row items-center gap-3">
          <Avatar>
            <AvatarFallback>RS</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle>Verificación de componentes</CardTitle>
            <CardDescription>Tailwind v4 con tokens shadcn</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="demo">Campo de ejemplo</Label>
          <Input id="demo" placeholder="Escribe algo..." />
        </CardContent>
        <CardFooter className="gap-2">
          <Button>Primario</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
        </CardFooter>
      </Card>
    </main>
  );
}
