<script lang="ts">
	import { Github, Twitter, Terminal } from 'lucide-svelte';
</script>

<footer class=" max-w-300 mx-auto bg-stone-900 border-t border-stone-800 py-6 font-mono ">
	<div class="max-w-xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="">
			<!-- <div class="col-span-1 md:col-span-2">
				<div class="flex items-center gap-2 mb-4">
					<div class="border border-white/20 p-1">
						<Terminal size={20} class="text-[var(--color-primary)]" />
					</div>
					<span class="font-bold text-xl tracking-tight text-white">onlocal.dev</span>
				</div>
				<p class="text-stone-500 text-sm leading-relaxed max-w-xs">
					> Executing vision...<br/>
					> Simple, fast, open.<br/>
					> EOF
				</p>
			</div> -->

			<div class="flex items-center justify-center py-4">
				<ul class="flex gap-12 text-sm text-stone-500">
					<li><a href="https://github.com/abdulmumin1/onlocal" class="hover:text-[var(--color-primary)] hover:underline decoration-[var(--color-primary)] underline-offset-4 transition-colors">Source Code</a></li>
					<li><a href="https://github.com/abdulmumin1/onlocal" class="hover:text-[var(--color-primary)] hover:underline decoration-[var(--color-primary)] underline-offset-4 transition-colors">Documentation</a></li>
					<li><a href="https://github.com/abdulmumin1/onlocal" class="hover:text-[var(--color-primary)] hover:underline decoration-[var(--color-primary)] underline-offset-4 transition-colors">Issues</a></li>
				</ul>
			</div>

			<!-- <div>
				<h4 class="font-bold text-white mb-4 border-b border-stone-800 inline-block pb-1">LEGAL_DOCS</h4>
				<ul class="space-y-2 text-sm text-stone-500">
					<li><a href="/privacy" class="hover:text-[var(--color-primary)] hover:underline decoration-[var(--color-primary)] underline-offset-4 transition-colors">Privacy</a></li>
					<li><a href="/terms" class="hover:text-[var(--color-primary)] hover:underline decoration-[var(--color-primary)] underline-offset-4 transition-colors">Terms</a></li>
				</ul>
			</div> -->
		</div>

		<div class="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-stone-800">
			<p class="text-stone-600 text-sm mb-4 md:mb-0">
				[C] {new Date().getFullYear()} By [Abdulmumin] X [The Thirdpen Company]
			</p>
			<div class="flex space-x-6">
				<a href="#" class="text-stone-500 hover:text-white transition-colors">
					<Github size={20} />
				</a>
				<a href="#" class="text-stone-500 hover:text-white transition-colors">
					<Twitter size={20} />
				</a>
			</div>
		</div>
	</div>
</footer>