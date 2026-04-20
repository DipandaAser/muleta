<script lang="ts">
import "../app.css"
import Shell from "$lib/shell/Shell.svelte"
import Favicon from "$lib/assets/favicon.svg"

let { children } = $props()
</script>

<svelte:head>
  <title>Muleta - A Redis Queue Manager</title>
  <link rel="icon" type="image/svg+xml" href={Favicon} />
</svelte:head>

<Shell>
  {@render children()}
</Shell>
