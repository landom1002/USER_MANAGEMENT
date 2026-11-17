"use client"

import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavSecondary } from "@/components/nav-secondary"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import Link from "next/link"
import {
  NAV_MAIN,
  NAV_MAIN_LABEL,
  NAV_PROJECTS,
  NAV_PROJECTS_LABEL,
  NAV_SECONDARY,
  SITE,
} from "@/lib/nav-config"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={SITE.home}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <SITE.icon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{SITE.name}</span>
                  <span className="truncate text-xs">{SITE.subtitle}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain label={NAV_MAIN_LABEL} items={NAV_MAIN} />
        {NAV_PROJECTS.length > 0 && <NavProjects label={NAV_PROJECTS_LABEL} projects={NAV_PROJECTS} />}
        <NavSecondary items={NAV_SECONDARY} className="mt-auto" />
      </SidebarContent>
    </Sidebar>
  )
}
