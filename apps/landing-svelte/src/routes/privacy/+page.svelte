<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<div class="min-h-screen bg-stone-950 text-stone-300 font-mono selection:bg-[var(--color-selection-bg)] selection:text-[var(--color-selection-text)]">
	<div class="scanlines"></div>
	<Navbar />
	<main class="py-24">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
			<h1 class="text-4xl font-bold mb-8 text-white">PRIVACY_POLICY</h1>

			<div class="space-y-8 text-stone-400 leading-relaxed">
				<section>
					<h2 class="text-2xl font-bold mb-4 text-white">1. INFORMATION_WE_COLLECT</h2>
					<p>
						onlocal.dev is committed to protecting your privacy. We do not collect, store, or process any personal information from our users.
					</p>
					<p class="mt-4">
						Our service operates by creating secure tunnels between your local development environment and the internet. We do not:
					</p>
					<ul class="list-disc list-inside mt-4 space-y-2 ml-4">
						<li>Log IP addresses</li>
						<li>Store request data</li>
						<li>Track user behavior</li>
						<li>Collect analytics data</li>
						<li>Use cookies or tracking pixels</li>
					</ul>
				</section>

				<section>
					<h2 class="text-2xl font-bold mb-4 text-white">2. HOW_OUR_SERVICE_WORKS</h2>
					<p>
						When you use <code class="bg-stone-800 px-2 py-1 rounded">bunx onlocal start 3000</code>, our service:
					</p>
					<ul class="list-disc list-inside mt-4 space-y-2 ml-4">
						<li>Establishes an encrypted connection to our edge servers</li>
						<li>Routes traffic from the public internet to your local server</li>
						<li>Provides HTTPS encryption for all connections</li>
						<li>Does not inspect, modify, or store any of your data</li>
					</ul>
				</section>

				<section>
					<h2 class="text-2xl font-bold mb-4 text-white">3. DATA_TRANSMISSION</h2>
					<p>
						All data transmitted through our service remains encrypted end-to-end. We cannot read or access the content of your requests or responses. The only information we process is necessary for routing traffic to the correct destination.
					</p>
				</section>

				<section>
					<h2 class="text-2xl font-bold mb-4 text-white">4. OPEN_SOURCE_TRANSPARENCY</h2>
					<p>
						onlocal.dev is open source software. You can review our source code at <a href="https://github.com/onlocal-dev/onlocal" class="text-green-500 hover:underline">https://github.com/onlocal-dev/onlocal</a> to verify that we do not collect or store any user data.
					</p>
					<p class="mt-4">
						Our commitment to privacy is enforced by code, not just policy. The absence of data collection mechanisms in our codebase ensures your privacy.
					</p>
				</section>

				<section>
					<h2 class="text-2xl font-bold mb-4 text-white">5. THIRD_PARTY_SERVICES</h2>
					<p>
						We do not integrate with any third-party analytics, advertising, or data collection services. Our service operates independently without external dependencies for user tracking.
					</p>
				</section>

				<section>
					<h2 class="text-2xl font-bold mb-4 text-white">6. CHANGES_TO_PRIVACY_POLICY</h2>
					<p>
						We may update our Privacy Policy from time to time. We will notify users of any changes by updating the policy on this page and revising the "Last updated" date.
					</p>
				</section>

				<section>
					<h2 class="text-2xl font-bold mb-4 text-white">7. CONTACT_US</h2>
					<p>
						If you have any questions about this Privacy Policy, please contact us through our GitHub repository or create an issue for discussion.
					</p>
				</section>

				<div class="border-t border-stone-800 pt-8 mt-12">
					<p class="text-sm text-stone-500">
						Last updated: {new Date().toLocaleDateString()}
					</p>
				</div>
			</div>
		</div>
	</main>
	<Footer />
</div>