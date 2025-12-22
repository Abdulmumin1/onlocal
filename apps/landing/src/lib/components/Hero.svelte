<script lang="ts">
	import { Copy, Check } from 'lucide-svelte';
	import TerminalDemo from './TerminalDemo.svelte';

	let copied = $state(false);

	function copyCommand() {
		navigator.clipboard.writeText('bunx onlocal 3000');
		copied = true;
		setTimeout(() => copied = false, 2000);
	}
</script>

<section class="relative pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden font-mono">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
		<div class="flex flex-col lg:flex-row items-start gap-12 lg:gap-20">

			<!-- Left Column: Copy -->
			<div class="flex-1 text-left w-full">
				<div class="inline-block border border-(--color-primary-darker) bg-(--color-primary-bg) text-(--color-primary-light) text-xs px-2 py-1 mb-6">
					SYSTEM_STATUS: ONLINE
				</div>

				<h1 class="text-3xl lg:text-6xl font-bold tracking-tighter mb-6 leading-none text-white">
					LOCALHOST<br />
					<span class="bg-white w-fit text-black px-2 flex">TO INTERNET
						<img class=" bg-white object-contain" width="32" height="32" src="https://img.icons8.com/pixels/32/internet.png" alt="internet"/>

					</span>


					
					IN SECONDS
				</h1>

				<p class="text-lg text-stone-400 mb-8 max-w-2xl leading-relaxed border-l-2 border-stone-800 pl-4">
					The fastest way to expose your local server. <br/>
					Powered by Bun.js. Zero configuration. <br/>
					Free and open source.
				</p>

				<div class="flex flex-col sm:flex-row items-start gap-4">
			

					<button
						onclick={copyCommand}
						class="group cursor-pointer px-6 py-4 border border-stone-700 bg-black hover:border-stone-500 text-stone-300 font-mono text-sm flex items-center gap-3 w-full sm:w-auto transition-all"
					>
						<span class="text-(--color-primary)">$</span>
						<span class="text-(--color-primary)">bunx</span> onlocal 3000
						{#if copied}
							<Check size={16} class="text-(--color-primary-light)" />
						{:else}
							<Copy size={16} class="text-stone-500 group-hover:text-white" />
						{/if}
					</button>
				</div>

				<div class="mt-8 flex items-center gap-6 text-sm text-stone-500 font-mono">
					<div class="flex items-center gap-2">
						<span>[x] Free Forever</span>
					</div>
					<div class="flex items-center gap-2">
						<span>[x] No Sign-up</span>
					</div>
				</div>
			</div>

			<!-- Right Column: Visual -->
			<div class="flex-1 w-full lg:max-w-none">
				<TerminalDemo />
			</div>
		</div>
	</div>
</section>