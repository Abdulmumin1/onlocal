<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Features from '$lib/components/Features.svelte';
	import Installation from '$lib/components/Installation.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<div class="min-h-screen bg-stone-950 text-gray-300 font-mono selection:bg-(--color-selection-bg) selection:text-(--color-selection-text)">
	<div class="scanlines"></div>
	<Navbar />
	<main>
		<Hero />
		<Features />
		<Installation />
	</main>
	<Footer />
</div>
