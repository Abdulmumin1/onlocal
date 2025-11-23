<script lang="ts">
	const features = [
		'Unlimited Tunnels',
		'HTTPS Encryption',
		'Request Inspection',
		'Local Dashboard',
		'Random Subdomains',
		'No Account Needed'
	];
</script>

<section id="pricing" class="py-24 bg-black relative overflow-hidden">
	<!-- Background Pattern -->
	<div class="absolute inset-0 opacity-10 pointer-events-none"
		 style="background-image: radial-gradient(#333 1px, transparent 1px); background-size: 20px 20px;">
	</div>

	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
		<div class="text-center mb-16">
			<h2 class="text-3xl md:text-4xl font-bold mb-6 text-white font-mono">
				COST_ANALYSIS
			</h2>
			<p class="text-gray-400 text-lg">
				Democratizing local development.
			</p>
		</div>

		<!-- Free Box -->
		<div class="border-2 border-white/20 bg-black p-1">
			<div class="border border-white/10 p-8 md:p-12 flex flex-col items-center text-center relative overflow-hidden">
				<!-- Banner -->
				<div class="absolute top-0 right-0 bg-white text-black text-xs font-bold px-3 py-1 font-mono">
					OPEN_SOURCE
				</div>

				<div class="mb-8">
					<h3 class="text-2xl font-bold text-white mb-2 font-mono">COMMUNITY_EDITION</h3>
					<div class="flex items-baseline justify-center gap-1 mt-4">
						<span class="text-5xl font-bold text-green-500 font-mono">$0</span>
						<span class="text-gray-500 font-mono">/forever</span>
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 text-left mb-10 w-full max-w-lg">
					{#each features as feat}
						<div class="flex items-center gap-3 text-gray-300 font-mono">
							<span class="text-green-500">[x]</span> {feat}
						</div>
					{/each}
				</div>

				<div class="w-full max-w-md">
					<div class="bg-gray-900 border border-gray-700 p-4 font-mono text-sm text-left mb-4">
						<span class="text-green-500">$</span> bunx onlocal start
					</div>
					<p class="text-gray-500 text-xs font-mono">
						MIT License. Maintained by the community.
					</p>
				</div>
			</div>
		</div>
	</div>
</section>