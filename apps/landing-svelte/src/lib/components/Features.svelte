<script lang="ts">
	import { Zap, Lock, Globe, Cpu, Code, Terminal } from 'lucide-svelte';

	const features = [
		{
			icon: Zap,
			title: "FAST_EXECUTION",
			description: "Built on Bun.js. Handles connections with minimal latency. Faster than Node.js alternatives."
		},
		{
			icon: Lock,
			title: "SECURE_TUNNELS",
			description: "Automatic HTTPS. End-to-end encryption. No data inspection. Your traffic is yours."
		},
		{
			icon: Globe,
			title: "EDGE_ROUTING",
			description: "Traffic routed through the nearest edge node. Low latency worldwide."
		},
		{
			icon: Cpu,
			title: "LOW_MEMORY",
			description: "Tiny memory footprint. Runs on Raspberry Pi or Potato. Highly efficient."
		},
		{
			icon: Code,
			title: "DEBUG_MODE",
			description: "Built-in request inspector dashboard. View headers, body, and replay requests."
		},
		{
			icon: Terminal,
			title: "NO_CONFIG",
			description: "No YAML. No dashboard login. Just run the command and get a URL."
		}
	];
</script>

<section id="features" class="py-24 bg-stone-950 border-y border-stone-800">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
		<div class="mb-16 border-b border-dashed border-stone-700 pb-8">
			<h2 class="text-3xl md:text-4xl font-bold mb-4 text-white">
				<span class="text-[var(--color-primary)]">#</span> SYSTEM_FEATURES
			</h2>
			<p class="text-stone-500 font-mono">
				Modules loaded successfully. Optimized for performance.
			</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-stone-800 border border-stone-800">
			{#each features as feature}
				<div class="group p-8 bg-stone-950 hover:bg-stone-900 transition-colors duration-200">
					<div class="mb-6 font-mono text-[var(--color-primary)]">
						<svelte:component this={feature.icon} class="text-[var(--color-primary)]" />
					</div>
					<h3 class="text-lg font-bold mb-3 text-white font-mono uppercase tracking-wider">
						{feature.title}
					</h3>
					<p class="text-stone-400 text-sm leading-relaxed font-mono">
						{feature.description}
					</p>
				</div>
			{/each}
		</div>
	</div>
</section>