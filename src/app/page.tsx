import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Trophy,
  BarChart3,
  MessageSquare,
  Shield,
  Zap,
  Globe,
  Lock,
} from "lucide-react"
import { AuthHeader } from "@/components/auth-header"

const features = [
  {
    icon: Trophy,
    title: "Tournament Management",
    description:
      "Create tournaments, generate fixtures, and manage match schedules with ease.",
  },
  {
    icon: BarChart3,
    title: "Live Rankings",
    description:
      "ELO-based or points-based rankings that update automatically after each match.",
  },
  {
    icon: MessageSquare,
    title: "Slack Integration",
    description:
      "Report match results and get tournament updates directly from Slack.",
  },
  {
    icon: Shield,
    title: "Role-Based Access",
    description:
      "Granular permissions for admins, managers, and players across your organization.",
  },
  {
    icon: Zap,
    title: "Real-Time Updates",
    description:
      "Instant notifications and live score updates as matches are completed.",
  },
  {
    icon: Globe,
    title: "Multi-Tenant Platform",
    description:
      "Run multiple independent organizations, each with its own theme and settings.",
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col flex-1">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold">
            🏓
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Cusports
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <AuthHeader />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden py-24 lg:py-32">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10" />
          <div className="relative container mx-auto px-4 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted px-4 py-1.5 text-sm text-muted-foreground mb-8">
              <Lock className="h-3 w-3" />
              Invite-only platform
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl mb-6">
              Table Tennis{" "}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Tournament Platform
              </span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              Run tournaments, manage players, record matches, and maintain
              rankings for your table tennis organization.
            </p>
            <div className="flex items-center justify-center gap-4">
              <AuthHeader showCta />
              <Link href="#features">
                <Button variant="outline" size="lg" className="text-lg px-8">
                  Learn More
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section id="features" className="py-16 lg:py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold tracking-tight mb-4">
                Everything you need to run your league
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                From tournament creation to live rankings, Cusports has you
                covered.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card
                    key={feature.title}
                    className="group hover:shadow-lg transition-shadow"
                  >
                    <CardContent className="p-6">
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                        <Icon className="h-6 w-6" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">
                        {feature.title}
                      </h3>
                      <p className="text-muted-foreground">
                        {feature.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Cusports. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
