<script lang="ts">
	import { onMount } from 'svelte';

	let lines = $state<string[]>([]);
	let cursorVisible = $state(true);

	onMount(() => {
		const cursorInterval = setInterval(() => {
			cursorVisible = !cursorVisible;
		}, 500);

		let timeout: ReturnType<typeof setTimeout>;

		const sequence = async () => {
			lines = [];

			// Step 1: Type command
			const command = "bunx onlocal start 3000";
			let currentText = "";
			for (let i = 0; i < command.length; i++) {
				currentText += command[i];
				lines = [`root@dev:~$ ${currentText}`];
				await new Promise(r => setTimeout(r, 50 + Math.random() * 50));
			}

			await new Promise(r => setTimeout(r, 400));

			// Step 2: Show output
			const output = [
				"Initializing tunnel...",
				"----------------------------------------",
				"STATUS  : ONLINE",
				"LATENCY : 12ms",
				"----------------------------------------",
				"HTTP    : http://localhost:3000",
				"HTTPS   : https://lucky-panda.onlocal.dev",
				"----------------------------------------",
				"Ready to accept connections."
			];

			lines = [lines[0]]; // Keep command

			for (const line of output) {
				lines = [...lines, line];
				await new Promise(r => setTimeout(r, 50));
			}

			timeout = setTimeout(sequence, 6000);
		};

		sequence();

		return () => {
			clearTimeout(timeout);
			clearInterval(cursorInterval);
		};
	});
</script>

<div class="w-full max-w-lg mx-auto relative">
	<!-- TUI Window -->
	<div class="bg-stone-950 border-2 border-stone-700 shadow-[8px_8px_0px_0px_rgba(40,40,40,0.5)]">
		<!-- TUI Header -->
		<div class="bg-stone-900 text-gray-300 px-4 py-1 text-xs uppercase tracking-wider border-b border-stone-700 flex justify-between items-center">
			<span>TERMINAL.EXE</span>
			<span>80x24</span>
		</div>

		<!-- Terminal Content -->
		<div class="p-4 h-80 font-mono text-sm md:text-base overflow-hidden flex flex-col text-gray-300">
			{#each lines as line}
				{#if line.includes('root@dev')}
					<div class="mb-2">
						<span class="text-[var(--color-primary)]">{line.split('$')[0]}$</span>
						<span class="text-white">{line.split('$')[1]}</span>
					</div>
				{:else if line.includes('https://')}
					<div class="text-[var(--color-primary-light)] font-bold">
						{line}
					</div>
				{:else}
					<div class="whitespace-pre-wrap">{line}</div>
				{/if}
			{/each}
					<!-- {JSON.stringify(lines)} -->
			<!-- Blinking Cursor -->
			{#if lines.length > 0}
					<span class={`inline-block w-2 h-4 bg-[var(--color-primary)] align-middle ${cursorVisible ? 'opacity-100' : 'opacity-0'}`}></span>
			{/if}
		</div>
	</div>
</div>