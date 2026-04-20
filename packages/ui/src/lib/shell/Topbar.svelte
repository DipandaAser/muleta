<script lang="ts">
import { page } from "$app/state"
import { Bell, ChevronRight, Moon, Search, Sun } from "@lucide/svelte"
import { theme } from "./theme.svelte"

function crumbsFor(pathname: string): string[] {
  if (pathname === "queues") return ["Queues"]
  return pathname.split("/").filter(Boolean)
}

let crumbs = $derived(crumbsFor(page.url.pathname))
</script>

<header
  class="flex h-12 items-center gap-3 px-5 border-b border-base-300 bg-base-100 shrink-0"
>
  <!-- breadcrumbs -->
  <nav class="flex items-center gap-2 text-[13px] min-w-0">
    {#each crumbs as c, i (i + c)}
      {#if i > 0}
        <span class="text-base-content/30">
          <ChevronRight size={12} />
        </span>
      {/if}
      <span
        class={i === crumbs.length - 1 ? "font-medium" : "text-base-content/70"}
        >{c}</span
      >
    {/each}
  </nav>

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
