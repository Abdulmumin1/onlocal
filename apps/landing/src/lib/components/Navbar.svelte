<script lang="ts">
	import { Menu, X } from 'lucide-svelte';

	let isMobileMenuOpen = $state(false);

	const navLinks = [
		{ name: 'FEATURES', href: '#features' },
		{ name: 'HOW_TO', href: '#how-it-works' },
	];
</script>

<nav class="fixed top-0 left-0 right-0 z-50 bg-stone-900 border-b border-white/20 font-mono text-sm">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="flex items-center justify-between h-14">
			<!-- Logo -->
			<a class="shrink-0 flex items-center gap-2 cursor-pointer group" href="/">
				<span class="text-(--color-primary) font-bold">{'>'}</span>
				<span class="font-bold text-white tracking-tight group-hover:bg-white group-hover:text-black transition-colors px-1">onlocal.dev</span>
				<span class="animate-pulse text-(--color-primary)">_</span>
			</a>

			<!-- Desktop Nav -->
			<div class="hidden md:block">
				<div class="ml-10 flex items-baseline space-x-6">
					{#each navLinks as link}
						<a
							href={link.href}
							class="text-stone-400 hover:text-(--color-primary-light) px-3 py-2 font-medium transition-colors hover:underline decoration-(--color-primary) underline-offset-4"
						>
							[{link.name}]
						</a>
					{/each}
				</div>
			</div>

			<!-- CTA Button -->
			<div class="hidden md:block">
				<a
					href="https://github.com/abdulmumin1/onlocal"
					target="_blank"
					rel="noopener noreferrer"
					class="border border-stone-600 bg-black text-white hover:bg-white hover:text-black px-4 py-1 transition-all"
				>
					★ STAR_ON_GITHUB
				</a>
			</div>

			<!-- Mobile menu button -->
			<div class="-mr-2 flex md:hidden">
				<button
					onclick={() => isMobileMenuOpen = !isMobileMenuOpen}
					class="inline-flex items-center justify-center p-2 text-stone-400 hover:text-white hover:bg-white/10 focus:outline-none"
				>
					{#if isMobileMenuOpen}
						<X size={20} />
					{:else}
						<Menu size={20} />
					{/if}
				</button>
			</div>
		</div>
	</div>

	<!-- Mobile Menu -->
	{#if isMobileMenuOpen}
		<div class="md:hidden bg-black border-b border-white/20">
			<div class="px-2 pt-2 pb-3 space-y-1 sm:px-3">
				{#each navLinks as link}
					<a
						href={link.href}
						onclick={() => isMobileMenuOpen = false}
						class="text-stone-300 hover:text-[var(--color-primary-light)] block px-3 py-2 text-base font-medium border-l-2 border-transparent hover:border-[var(--color-primary-light)] hover:bg-white/5"
					>
						{'>'} {link.name}
					</a>
				{/each}
			</div>
		</div>
	{/if}
</nav>