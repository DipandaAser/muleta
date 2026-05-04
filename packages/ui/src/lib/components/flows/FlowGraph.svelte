<script lang="ts">
	import type { FlowJobNode } from "$lib/api/client"
	import { theme } from "$lib/shell/theme.svelte"
	import dagre from "@dagrejs/dagre"
	import {
		Background,
		BackgroundVariant,
		type ColorMode,
		Controls,
		type Edge,
		MiniMap,
		type Node,
		SvelteFlow,
	} from "@xyflow/svelte"
	import "@xyflow/svelte/dist/style.css"
	import FlowNodeCard from "./FlowNodeCard.svelte"

	interface Props {
		root: FlowJobNode
		queueName: string
	}

	let { root, queueName }: Props = $props()

	let colorMode = $derived<ColorMode>(theme.value === "muleta-dark" ? "dark" : "light")

	const NODE_WIDTH = 260
	const NODE_HEIGHT = 96

	const nodeTypes = { flowJob: FlowNodeCard }

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
					animated: child.state === "active",
				})
				stack.push(child)
			}
		}
		return { nodes, edges }
	}

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
			// dagre returns center; xyflow expects top-left.
			return {
				...n,
				position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
			}
		})
	}

	let { nodes, edges } = $derived.by(() => {
		const flat = flatten(root)
		const placed = layout(flat.nodes, flat.edges)
		return { nodes: placed, edges: flat.edges }
	})
</script>

<div class="muleta-flow h-full w-full">
	<SvelteFlow
		{colorMode}
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
	/* https://svelteflow.dev/learn/customization/theming */
	.muleta-flow :global(.svelte-flow) {
		--xy-background-color: var(--color-base-100);
		--xy-background-pattern-dots-color: color-mix(
			in oklab,
			var(--color-base-content) 12%,
			transparent
		);
		--xy-edge-stroke: color-mix(in oklab, var(--color-base-content) 35%, transparent);
		--xy-edge-stroke-selected: var(--color-primary);
		--xy-controls-button-background-color: var(--color-base-200);
		--xy-controls-button-background-color-hover: var(--color-base-300);
		--xy-controls-button-color: var(--color-base-content);
		--xy-controls-button-border-color: var(--color-base-300);
		--xy-minimap-background-color: var(--color-base-200);
		--xy-minimap-node-background-color: var(--color-base-300);
	}

	/* xyflow has no variable for animated edges. */
	.muleta-flow :global(.svelte-flow__edge.animated .svelte-flow__edge-path) {
		stroke: var(--color-state-active, var(--color-info));
	}
</style>
