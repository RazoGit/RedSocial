"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Compass, Home, Mail, Plus, Search, User } from "lucide-react";

import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/auth/logout-button";
import { UserAvatar } from "@/components/user";
import { Button } from "@/components/ui/button";
import { currentUser } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/feed", label: "Inicio", icon: Home },
  { href: "/explore", label: "Explorar", icon: Compass },
  { href: "/messages", label: "Mensajes", icon: Mail },
  { href: "/notifications", label: "Notificaciones", icon: Bell },
  { href: "/profile", label: "Perfil", icon: User },
];

function useIsActive(href: string): boolean {
  const pathname = usePathname();
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ href, label, icon: Icon }: (typeof navItems)[number]) {
  const active = useIsActive(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
}

export function AppSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-background px-4 py-6 md:flex">
      <Link href="/feed" className="mb-8 px-3">
        <Logo size={32} />
      </Link>

      <nav aria-label="Navegacion principal" className="flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>

      <Button asChild className="mt-6 w-full">
        <Link href="/create">
          <Plus className="size-4" />
          Crear publicacion
        </Link>
      </Button>

      <div className="mt-auto">
        <div className="flex items-center gap-1 rounded-lg p-1 transition-colors hover:bg-secondary">
          <Link href="/profile" className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1">
            <UserAvatar name={currentUser.name} className="size-9" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{currentUser.name}</span>
              <span className="text-muted-foreground block truncate text-xs">
                @{currentUser.handle}
              </span>
            </span>
          </Link>
          <LogoutButton mode="icon" />
        </div>
      </div>
    </aside>
  );
}

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur md:hidden">
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4">
        <Link href="/feed" aria-label="Inicio">
          <Logo size={28} />
        </Link>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild className="size-10">
            <Link href="/explore" aria-label="Buscar">
              <Search className="size-5" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild className="size-10">
            <Link href="/notifications" aria-label="Notificaciones">
              <span className="relative">
                <Bell className="size-5" />
                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary" />
              </span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const leftItems = navItems.slice(0, 2);
  const rightItems = navItems.slice(2);

  return (
    <nav
      aria-label="Navegacion inferior"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex h-16 w-full max-w-md items-stretch justify-around px-2">
        {leftItems.map((item) => (
          <li key={item.href} className="flex items-center">
            <NavLink {...item} />
          </li>
        ))}
        <li className="flex items-center">
          <Button
            asChild
            size="icon"
            className="-mt-10 size-14 rounded-full shadow-lg shadow-primary/30 ring-4 ring-background"
          >
            <Link href="/create" aria-label="Crear publicacion">
              <Plus className="size-6" />
            </Link>
          </Button>
        </li>
        {rightItems.map((item) => (
          <li key={item.href} className="flex items-center">
            <NavLink {...item} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
