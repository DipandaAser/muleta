<script lang="ts">
  import { page } from "$app/state"
  import { Bell, Moon, Search, Sun } from "@lucide/svelte"
  import { NAV } from "./nav"
  import { theme } from "./theme.svelte"

  const NAV_ITEMS = NAV.flatMap((section) => section.items)

  // The nav item whose route matches the current path. Guard on href so
  // disabled placeholders (href === undefined) don't match everything via
  // startsWith("").
  let activeNavItem = $derived(
    NAV_ITEMS.find((it) => it.href && page.url.pathname.startsWith(it.href)) ??
      null,
  )

  // First crumb uses the nav item's label; subsequent crumbs are the
  // remaining path segments. Each crumb also knows its cumulative href
  // so we can link back up the hierarchy.
  type Crumb = { label: string; href: string }
  let crumbs = $derived.by<Crumb[]>(() => {
    const segs = page.url.pathname.split("/").filter(Boolean)
    if (segs.length === 0) {
      return [
        {
          label: activeNavItem?.label ?? "Queues",
          href: activeNavItem?.href ?? "/",
        },
      ]
    }
    return segs.map((seg, i) => ({
      label: i === 0 ? (activeNavItem?.label ?? seg) : seg,
      href: `/${segs.slice(0, i + 1).join("/")}`,
    }))
  })
</script>

<header
  id="top-bar"
  class="flex h-12 items-center gap-3 px-5 border-b border-base-300 bg-base-100 shrink-0"
>
  <div class="breadcrumbs text-sm min-w-0">
    <ul>
      {#each crumbs as c, i (c.href)}
        {@const isLast = i === crumbs.length - 1}
        {@const showIcon = i === 0 && activeNavItem !== null}
        <li>
          {#if isLast}
            <span class="inline-flex gap-2 items-center">
              {#if showIcon && activeNavItem}
                {@const Ico = activeNavItem.icon}
                <Ico
                  size={14}
                  class="text-base-content/60 {activeNavItem.iconClass ?? ''}"
                />
              {/if}
              {c.label}
            </span>
          {:else}
            <a href={c.href} class="inline-flex gap-2 items-center">
              {#if showIcon && activeNavItem}
                {@const Ico = activeNavItem.icon}
                <Ico
                  size={14}
                  class="text-base-content/60 {activeNavItem.iconClass ?? ''}"
                />
              {/if}
              {c.label}
            </a>
          {/if}
        </li>
      {/each}
    </ul>
  </div>

  <!-- search (placeholder only) -->
  <div
    class="ml-auto flex items-center gap-2 w-72 h-7 px-3 rounded-md bg-base-200 border border-base-300 text-base-content/50"
  >
    <Search size={12} />
    <input
      type="text"
      placeholder="Jump to queue, job #id, worker…"
      class="flex-1 bg-transparent border-0 outline-0 text-xs text-base-content"
      disabled
    />
    <kbd
      class="font-mono-muleta text-[10px] px-1 py-px rounded bg-base-300 text-base-content/60 border border-base-300"
    >
      ⌘K
    </kbd>
  </div>

  <!-- actions -->
  <div class="flex items-center gap-1">
    <button
      type="button"
      class="btn btn-ghost btn-square btn-sm text-base-content/70"
      aria-label="Toggle theme"
      onclick={() => theme.toggle()}
    >
      {#if theme.value === "muleta-dark"}
        <Sun size={14} />
      {:else}
        <Moon size={14} />
      {/if}
    </button>
    <button
      type="button"
      class="btn btn-ghost btn-square btn-sm text-base-content/70"
      aria-label="Notifications"
    >
      <Bell size={14} />
    </button>
  </div>
</header>
