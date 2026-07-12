import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Lock } from "lucide-react"

export default function RegisterPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-4 bg-gradient-to-br from-primary/5 via-background to-primary/10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>Invite Only</CardTitle>
          <CardDescription>
            Cusports is an invite-only platform. New accounts can only be created by an organization manager or platform admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            If you have an invitation link or were invited by a manager, please check your email for the invitation.
          </p>
          <Link href="/auth/login">
            <Button className="w-full">
              Sign In Instead
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
