<script lang="ts">
	import { Copy, Check } from 'lucide-svelte';

	let activeTab = $state('bun');
	let copied = $state({ quick: false, global: false });

	const tabs = [
		{ id: 'bun', name: 'Bun', quick: { cmd: 'bunx', rest: 'onlocal PORT' }, global: { cmd: 'bun', rest: 'add -g onlocal' } },
		{ id: 'npm', name: 'npm', quick: { cmd: 'npx', rest: 'onlocal PORT' }, global: { cmd: 'npm', rest: 'install -g onlocal' } },
		{ id: 'pnpm', name: 'pnpm', quick: { cmd: 'pnpx', rest: 'onlocal PORT' }, global: { cmd: 'pnpm', rest: 'add -g onlocal' } }
	];

	function copyQuick(command: string) {
		navigator.clipboard.writeText(command);
		copied.quick = true;
		setTimeout(() => copied.quick = false, 2000);
	}

	function copyGlobal(command: string) {
		navigator.clipboard.writeText(command);
		copied.global = true;
		setTimeout(() => copied.global = false, 2000);
	}
</script>

<section id="installation" class="py-24 bg-stone-950 border-y border-stone-800">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
		<div class="mb-16 border-b border-dashed border-stone-700 pb-8">
			<h2 class="text-3xl md:text-4xl font-bold mb-4 text-white">
				<span class="text-[var(--color-primary)]">#</span> INSTALLATION
			</h2>
			<p class="text-stone-500 font-mono">
				Built on Bun & Durable Objects. Choose your package manager.
			</p>
		</div>

		<div class="flex border-b border-stone-700 mb-8">
			{#each tabs as tab}
				<button
					class="px-4 py-2 font-mono text-sm {activeTab === tab.id ? 'text-white border-b-2 border-[var(--color-primary)]' : 'text-stone-500 hover:text-white'} transition-colors"
					onclick={() => activeTab = tab.id}
				>
					{tab.name}
				</button>
			{/each}
		</div>

		{#each tabs as tab}
			{#if activeTab === tab.id}
				<div class="space-y-8">
					<div class="bg-stone-950 border border-stone-700 p-6 font-mono">
						<div class="flex items-center gap-3">
							<pre class="text-stone-300 flex-1"><code><span class="text-[var(--color-primary)]">{tab.quick.cmd}</span> {tab.quick.rest}</code></pre>
							<button onclick={() => copyQuick(`${tab.quick.cmd} ${tab.quick.rest}`)} class="group cursor-pointer p-2 border border-stone-700 bg-black hover:border-stone-500 text-stone-300 transition-all">
								{#if copied.quick}
									<Check size={16} class="text-[var(--color-primary-light)]" />
								{:else}
									<Copy size={16} class="text-stone-500 group-hover:text-white" />
								{/if}
							</button>
						</div>
						<p class="text-stone-400 text-sm mt-2">Run without installation.</p>
					</div>

					<div class="bg-stone-950 border border-stone-700 p-6 font-mono">
						<div class="flex items-center gap-3">
							<pre class="text-stone-300 flex-1"><code><span class="text-[var(--color-primary)]">{tab.global.cmd}</span> {tab.global.rest}</code></pre>
							<button onclick={() => copyGlobal(`${tab.global.cmd} ${tab.global.rest}`)} class="group cursor-pointer p-2 border border-stone-700 bg-black hover:border-stone-500 text-stone-300 transition-all">
								{#if copied.global}
									<Check size={16} class="text-[var(--color-primary-light)]" />
								{:else}
									<Copy size={16} class="text-stone-500 group-hover:text-white" />
								{/if}
							</button>
						</div>
						<p class="text-stone-400 text-sm mt-2">Install globally for repeated use.</p>
					</div>
				</div>
			{/if}
		{/each}
	</div>
</section>