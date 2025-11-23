<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<div class="min-h-screen bg-stone-950 text-stone-300 font-mono selection:bg-[var(--color-selection-bg)] selection:text-[var(--color-selection-text)]">
	<div class="scanlines"></div>
	<Navbar />
	<main class="py-24">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
			<h1 class="text-4xl font-bold mb-8 text-white">TERMS_OF_SERVICE</h1>

			<div class="space-y-8 text-stone-400 leading-relaxed">
				<section>
					<h2 class="text-2xl font-bold mb-4 text-white">1. ACCEPTANCE_OF_TERMS</h2>
					<p>
						By accessing and using onlocal.dev ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.
					</p>
				</section>

				<section>
					<h2 class="text-2xl font-bold mb-4 text-white">2. USE_LICENSE</h2>
					<p>
						Permission is granted to temporarily use the Service for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
					</p>
					<ul class="list-disc list-inside mt-4 space-y-2 ml-4">
						<li>modify or copy the materials</li>
						<li>use the materials for any commercial purpose or for any public display</li>
						<li>attempt to reverse engineer any software contained on the Service</li>
						<li>remove any copyright or other proprietary notations from the materials</li>
					</ul>
				</section>

				<section>
					<h2 class="text-2xl font-bold mb-4 text-white">3. SERVICE_DESCRIPTION</h2>
					<p>
						onlocal.dev provides a tunneling service to expose local development servers to the internet. The service is provided "as is" without warranties of any kind.
					</p>
				</section>

				<section>
					<h2 class="text-2xl font-bold mb-4 text-white">4. USER_RESPONSIBILITIES</h2>
					<p>
						You are responsible for:
					</p>
					<ul class="list-disc list-inside mt-4 space-y-2 ml-4">
						<li>Maintaining the security of your local server</li>
						<li>Ensuring your content complies with applicable laws</li>
						<li>Not using the service for illegal activities</li>
						<li>Not attempting to overload or disrupt the service</li>
					</ul>
				</section>

				<section>
					<h2 class="text-2xl font-bold mb-4 text-white">5. LIMITATION_OF_LIABILITY</h2>
					<p>
						In no event shall onlocal.dev or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the Service.
					</p>
				</section>

				<section>
					<h2 class="text-2xl font-bold mb-4 text-white">6. TERMINATION</h2>
					<p>
						We may terminate or suspend access to our Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
					</p>
				</section>

				<section>
					<h2 class="text-2xl font-bold mb-4 text-white">7. GOVERNING_LAW</h2>
					<p>
						These Terms shall be interpreted and governed by the laws of the jurisdiction in which onlocal.dev operates, without regard to conflict of law provisions.
					</p>
				</section>

				<section>
					<h2 class="text-2xl font-bold mb-4 text-white">8. CHANGES_TO_TERMS</h2>
					<p>
						We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days notice prior to any new terms taking effect.
					</p>
				</section>

				<section>
					<h2 class="text-2xl font-bold mb-4 text-white">9. CONTACT_INFORMATION</h2>
					<p>
						If you have any questions about these Terms, please contact us through our GitHub repository.
					</p>
				</section>
			</div>
		</div>
	</main>
	<Footer />
</div>