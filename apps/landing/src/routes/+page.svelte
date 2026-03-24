<svelte:head>
	<title>onlocal</title>
	<meta
		name="description"
		content="Expose your localhost to the internet with a single command."
	/>
</svelte:head>

<main class="min-h-screen bg-stone-50 px-6 py-16 text-stone-950">
	<section class="mx-auto max-w-2xl">
		<img
			src="/tunnel-art.svg"
			alt="Tunnel illustration"
			class="mb-10 h-auto w-28 sm:w-36"
		/>

		<h1 class="text-3xl font-medium tracking-tight text-stone-950 sm:text-5xl">onlocal</h1>
		<p class="mt-4 max-w-lg text-sm leading-6 text-stone-600 sm:text-base">
			Expose your local server to the internet.
		</p>

		<div class="mt-12 space-y-8">
			<div>
				<p class="text-xs uppercase tracking-[0.18em] text-stone-500">Quick run</p>
				<pre class="mt-2 overflow-x-auto border-l border-stone-300 pl-4 text-sm text-stone-950 sm:text-base"><code>bunx onlocal 3000</code></pre>
				<p class="mt-2 text-sm text-stone-500">Recommended. Always uses the latest version.</p>
			</div>

			<div>
				<p class="text-xs uppercase tracking-[0.18em] text-stone-500">macOS / Linux install</p>
				<pre class="mt-2 overflow-x-auto border-l border-stone-300 pl-4 text-sm text-stone-950 sm:text-base"><code>curl -fsSL https://onlocal.dev/install.sh | bash</code></pre>
			</div>

			<div>
				<p class="text-xs uppercase tracking-[0.18em] text-stone-500">Windows install</p>
				<pre class="mt-2 overflow-x-auto border-l border-stone-300 pl-4 text-sm text-stone-950 sm:text-base"><code>irm https://onlocal.dev/install.ps1 | iex</code></pre>
			</div>
		</div>

		<a
			href="https://github.com/abdulmumin1/onlocal"
			target="_blank"
			rel="noopener noreferrer"
			class="mt-12 inline-block text-sm text-stone-500 underline decoration-stone-300 underline-offset-4 hover:text-stone-950"
		>
			GitHub
		</a>
	</section>
</main>
