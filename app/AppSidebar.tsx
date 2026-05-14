"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

import { AutoApproveContainer } from "./AutoApproveContainer";

const operatorDestinations = [
  { label: "Dashboard", href: "/" },
  { label: "Review Desk", href: "/review-desk" },
  { label: "SOP Library", href: "/sops" },
] as const;

export function AppSidebar({ autoModeEnabled }: { autoModeEnabled: boolean }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="none" className="w-60 border-r border-sidebar-border">
      <SidebarHeader>
        <Link
          href="/"
          className="flex h-10 items-center px-2 text-sm font-semibold"
        >
          PropertyLead
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {operatorDestinations.map((destination) => {
                const active = isActive(pathname, destination.href);
                return (
                  <SidebarMenuItem key={destination.href}>
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute top-1.5 bottom-1.5 left-0 z-10 w-0.5 rounded-full bg-sidebar-primary"
                      />
                    ) : null}
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={destination.href}>{destination.label}</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
      </SidebarContent>
      <SidebarFooter>
        <AutoApproveContainer enabled={autoModeEnabled} />
      </SidebarFooter>
    </Sidebar>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
