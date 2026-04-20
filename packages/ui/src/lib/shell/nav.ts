import { ChartBar, Clock, Code, GitFork, Plug, Rows4, Server, Shield } from "@lucide/svelte"
import type { Component } from "svelte"

export interface NavItem {
  id: string
  label: string
  icon: Component
  /** Extra tailwind classes applied to the icon — e.g. `rotate-180` to flip. */
  iconClass?: string
  href?: string
  count?: string | number
  dotColor?: string
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const NAV: NavSection[] = [
  {
    title: "Dashboard",
    items: [
      { id: "queues", label: "Queues", icon: Rows4, href: "/queues" },
      { id: "flows", label: "Flows", icon: GitFork, iconClass: "rotate-180" },
      { id: "workers", label: "Workers", icon: Server, href: "/workers" },
      { id: "schedulers", label: "Schedulers", icon: Clock },
      { id: "metrics", label: "Metrics", icon: ChartBar },
    ],
  },
  {
    title: "Plugins",
    items: [
      { id: "plugins", label: "Plugin settings", icon: Plug },
      { id: "audit", label: "Audit log", icon: Shield },
      { id: "embed", label: "Embedding", icon: Code },
    ],
  },
]
