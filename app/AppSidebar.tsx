"use client";

import {
  BookOpen01Icon,
  DashboardSquare01Icon,
  House01Icon,
  InboxIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import { AutoApproveContainer } from "./AutoApproveContainer";

const operatorDestinations = [
  { label: "Dashboard", href: "/", icon: DashboardSquare01Icon },
  { label: "Review Desk", href: "/review-desk", icon: InboxIcon },
  { label: "SOP Library", href: "/sops", icon: BookOpen01Icon },
] as const;

export function AppSidebar({ autoModeEnabled }: { autoModeEnabled: boolean }) {
  const pathname = usePathname();

  return (
    <Sidebar
      collapsible="none"
      className="sticky top-0 h-svh w-60 shrink-0 self-start overflow-y-auto border-r border-sidebar-border bg-sidebar"
    >
      <SidebarHeader className="px-3 pt-4 pb-2">
        <Link
          href="/"
          className="group flex items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold tracking-tight"
        >
          <span className="flex size-7 items-center justify-center rounded-md bg-foreground/90 text-background ring-1 ring-foreground/10">
            <HugeiconsIcon icon={House01Icon} strokeWidth={2} className="size-4" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[13px] font-semibold tracking-tight">
              PropertyLead
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Review Desk
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1.5">
        <SidebarGroup className="py-2">
          <SidebarGroupLabel className="px-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {operatorDestinations.map((destination) => {
                const active = isActive(pathname, destination.href);
                return (
                  <SidebarMenuItem key={destination.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className="h-8 gap-2.5 rounded-md text-[13px] font-medium text-sidebar-foreground/80 data-active:bg-elevated data-active:text-sidebar-foreground data-active:ring-1 data-active:ring-sidebar-border data-active:shadow-[0_1px_0_0_oklch(0_0_0/0.03)]"
                    >
                      <Link href={destination.href}>
                        <HugeiconsIcon
                          icon={destination.icon}
                          strokeWidth={active ? 2 : 1.75}
                          className={
                            active
                              ? "text-sidebar-foreground"
                              : "text-muted-foreground"
                          }
                        />
                        <span>{destination.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="mt-auto gap-3 border-t border-sidebar-border/80 bg-sidebar/40 px-3 py-3">
        <AutoApproveContainer enabled={autoModeEnabled} />
      </SidebarFooter>
    </Sidebar>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
