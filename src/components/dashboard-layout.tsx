"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  Settings,
  Users,
  Trophy,
  Megaphone,
  Link2,
  Menu,
  Moon,
  Sun,
  ChevronRight,
} from "lucide-react";
import { useState, useSyncExternalStore } from "react";

interface DashboardLayoutProps {
  children: React.ReactNode;
  organization: {
    slug: string;
    name: string;
  };
}

const navItems = [
  {
    label: "Overview",
    href: (slug: string) => `/org/${slug}/dashboard`,
    icon: LayoutDashboard,
  },
  {
    label: "Settings",
    href: (slug: string) => `/org/${slug}/dashboard/settings`,
    icon: Settings,
  },
  {
    label: "Players",
    href: (slug: string) => `/org/${slug}/dashboard/players`,
    icon: Users,
  },
  {
    label: "Tournaments",
    href: (slug: string) => `/org/${slug}/dashboard/tournaments`,
    icon: Trophy,
  },
  {
    label: "Announcements",
    href: (slug: string) => `/org/${slug}/dashboard/banners`,
    icon: Megaphone,
  },
  {
    label: "Integrations",
    href: (slug: string) => `/org/${slug}/dashboard/integrations/slack`,
    icon: Link2,
  },
];

function SidebarNav({
  slug,
  onNavClick,
}: {
  slug: string;
  onNavClick?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="p-4">
        <Link
          href={`/org/${slug}`}
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            {slug.charAt(0).toUpperCase()}
          </div>
          <span className="truncate">Dashboard</span>
        </Link>
      </div>
      <Separator />
      <ScrollArea className="flex-1 px-3 py-2">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const href = item.href(slug);
            const isActive =
              pathname === href || pathname.startsWith(`${href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={href}
                onClick={onNavClick}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
      <Separator />
      <div className="p-4">
        <Link
          href={`/org/${slug}`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
          View site
        </Link>
      </div>
    </div>
  );
}

export function DashboardLayout({
  children,
  organization,
}: DashboardLayoutProps) {
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile header */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4 lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-60 p-0">
            <SidebarNav
              slug={organization.slug}
              onNavClick={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2 font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            {organization.slug.charAt(0).toUpperCase()}
          </div>
          {organization.name}
        </div>
        <div className="ml-auto">
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-56 lg:flex-col lg:border-r">
        <SidebarNav slug={organization.slug} />
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col lg:pl-0">
        {/* Desktop top bar */}
        <header className="hidden lg:flex h-14 items-center justify-between border-b bg-background px-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>/</span>
            <Link
              href={`/org/${organization.slug}`}
              className="hover:text-foreground"
            >
              {organization.slug}
            </Link>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-foreground font-medium">dashboard</span>
          </div>
          <div className="flex items-center gap-2">
            {mounted && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 pt-20 lg:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
