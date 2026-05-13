import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const destinations = [
  {
    title: "Review Desk",
    description: "Approve pending HubSpot Writeback Plans.",
    href: "/review-desk",
  },
  {
    title: "SOP Library",
    description: "Upload and inspect SOP Documents used for enrichment.",
    href: "/sops",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-2 border-b border-border pb-5">
          <p className="text-sm font-medium text-muted-foreground">
            PropertyLead Review Desk
          </p>
          <h1 className="text-2xl font-semibold tracking-normal">
            Operator Workspace
          </h1>
        </header>
        <div className="grid gap-3 md:grid-cols-2">
          {destinations.map((destination) => (
            <Link key={destination.href} href={destination.href}>
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardHeader>
                  <CardTitle>{destination.title}</CardTitle>
                  <CardDescription>{destination.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="inline-flex items-center gap-1 text-sm font-medium">
                    Open
                    <HugeiconsIcon
                      icon={ArrowRight02Icon}
                      strokeWidth={2}
                      data-icon="inline-end"
                    />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
