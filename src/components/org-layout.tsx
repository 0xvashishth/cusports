"use client"

import Link from "next/link"
import { useTheme } from "next-themes"
import { useEffect, useState, useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { Moon, Sun, Menu } from "lucide-react"
import { cn } from "@/lib/utils"

interface OrgLayoutProps {
  children: React.ReactNode
  organization: {
    slug: string
    name: string
    logo_url: string | null
  }
}

const navLinks = [
  { label: "Home", href: (slug: string) => `/org/${slug}` },
  { label: "Rankings", href: (slug: string) => `/org/${slug}#rankings` },
  { label: "Tournaments", href: (slug: string) => `/org/${slug}#tournaments` },
]

export function OrgLayout({ children, organization }: OrgLayoutProps) {
  const { theme, setTheme } = useTheme()
  const [scrolled, setScrolled] = useState(false)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      <header
        className={cn(
          "sticky top-0 z-50 transition-all duration-200",
          scrolled
            ? "border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
            : "bg-transparent"
        )}
      >
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href={`/org/${organization.slug}`} className="flex items-center gap-3">
            {organization.logo_url ? (
              <img src={organization.logo_url} alt="" className="h-8 w-8 rounded-full" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                {organization.name.charAt(0)}
              </div>
            )}
            <span className="text-lg font-semibold">{organization.name}</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href(organization.slug)}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {mounted && (
              <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            )}
            <Link href={`/org/${organization.slug}/dashboard`}>
              <Button variant="default" size="sm" className="hidden md:flex">
                Dashboard
              </Button>
            </Link>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <div className="mt-8 flex flex-col gap-4">
                  {navLinks.map((link) => (
                    <Link
                      key={link.label}
                      href={link.href(organization.slug)}
                      className="text-lg font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  ))}
                  <Separator className="my-4" />
                  <Link href={`/org/${organization.slug}/dashboard`}>
                    <Button className="w-full">Dashboard</Button>
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
