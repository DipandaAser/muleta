<script lang="ts">
	import type { FlowJobNode } from "$lib/api/client"
	import dagre from "@dagrejs/dagre"
	import {
		Background,
		BackgroundVariant,
		Controls,
		MiniMap,
		SvelteFlow,
		type Edge,
		type Node,
	} from "@xyflow/svelte"
	import "@xyflow/svelte/dist/style.css"
	import FlowNodeCard from "./FlowNodeCard.svelte"

	interface Props {
		root: FlowJobNode
		queueName: string
	}

	let { root, queueName }: Props = $props()

	// Approximate card footprint for the dagre layout. Real DOM size is
	// driven by the card's min-width/max-width + content — picking the
	// upper bound keeps siblings from overlapping when children have long
	// names or progress bars.
	const NODE_WIDTH = 260
	const NODE_HEIGHT = 96

	const nodeTypes = { flowJob: FlowNodeCard }

	/**
	 * Walk the recursive `FlowJobNode` and produce a flat list of xyflow
	 * `Node`s + `Edge`s. Layout positions are filled in by dagre below.
	 */
	function flatten(root: FlowJobNode): {
		nodes: Array<Node & { data: { node: FlowJobNode; queueName: string } }>
		edges: Edge[]
	} {
		const nodes: Array<Node & { data: { node: FlowJobNode; queueName: string } }> = []
		const edges: Edge[] = []
		const stack: FlowJobNode[] = [root]
		while (stack.length > 0) {
			const n = stack.pop()!
			nodes.push({
				id: n.id,
				type: "flowJob",
				position: { x: 0, y: 0 },
				data: { node: n, queueName },
			})
			for (const child of n.children) {
				edges.push({
					id: `${n.id}->${child.id}`,
					source: n.id,
					target: child.id,
					// Active branches get a dashed accent so the graph reads
					// as "this is the live path" without a separate legend.
					animated: child.state === "active",
				})
				stack.push(child)
			}
		}
		return { nodes, edges }
	}

	/**
	 * Layered left→right layout. Dagre places nodes given a virtual size
	 * and we assign the resulting `(x, y)` back onto the xyflow nodes.
	 * `nodesep` keeps siblings vertically apart; `ranksep` controls the
	 * column spacing.
	 */
	function layout(
		nodes: Array<Node & { data: { node: FlowJobNode } }>,
		edges: Edge[],
	): typeof nodes {
		const g = new dagre.graphlib.Graph({ directed: true })
		g.setDefaultEdgeLabel(() => ({}))
		g.setGraph({ rankdir: "LR", nodesep: 20, ranksep: 60, marginx: 16, marginy: 16 })
		for (const n of nodes) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
		for (const e of edges) g.setEdge(e.source, e.target)
		dagre.layout(g)

		return nodes.map((n) => {
			const { x, y } = g.node(n.id)
			return {
				...n,
				// dagre returns the node's center; xyflow expects top-left.
				position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
			}
		})
	}

	// Recompute on root change (different flow selected, or invalidate-all
	// re-fetch returns updated states).
	let { nodes, edges } = $derived.by(() => {
		const flat = flatten(root)
		const placed = layout(flat.nodes, flat.edges)
		return { nodes: placed, edges: flat.edges }
	})
</script>

<div class="h-full w-full">
	<SvelteFlow
		nodes={nodes as Node[]}
		{edges}
		{nodeTypes}
		fitView
		fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
		nodesDraggable={false}
		nodesConnectable={false}
		elementsSelectable={true}
		proOptions={{ hideAttribution: true }}
	>
		<Background variant={BackgroundVariant.Dots} gap={16} size={1} />
		<Controls showLock={false} />
		<MiniMap pannable zoomable />
	</SvelteFlow>
</div>

<style>
	/* Theme the SvelteFlow chrome to match the dashboard's tokens — the
	   library's defaults assume a white-ish background that clashes with
	   our base-100 + dark accents. */
	:global(.svelte-flow) {
		background: var(--color-base-100);
	}
	:global(.svelte-flow__edge-path) {
		stroke: var(--color-base-content);
		stroke-opacity: 0.35;
		stroke-width: 1.5;
	}
	:global(.svelte-flow__edge.animated .svelte-flow__edge-path) {
		stroke: var(--color-state-active, var(--color-info));
		stroke-opacity: 0.85;
		stroke-dasharray: 5 5;
	}
	:global(.svelte-flow__controls-button) {
		background: var(--color-base-200);
		border-color: var(--color-base-300);
		color: var(--color-base-content);
	}
	:global(.svelte-flow__controls-button:hover) {
		background: var(--color-base-300);
	}
	:global(.svelte-flow__minimap) {
		background: var(--color-base-200);
		border: 1px solid var(--color-base-300);
		border-radius: 4px;
	}
</style>
