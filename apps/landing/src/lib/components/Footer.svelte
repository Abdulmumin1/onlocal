<script lang="ts">
	import { Github, Twitter, Terminal } from 'lucide-svelte';
</script>

<footer class=" max-w-300 mx-auto bg-stone-900 border-t border-stone-800 py-6 font-mono ">
	<div class="max-w-xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="">
		

			<div class="flex items-center justify-center py-4">
				<ul class="flex gap-12 text-sm text-stone-500">
					<li><a href="https://github.com/abdulmumin1/onlocal" class="hover:text-(--color-primary) hover:underline decoration-(--color-primary) underline-offset-4 transition-colors">Source Code</a></li>
					<li><a href="https://github.com/abdulmumin1/onlocal" class="hover:text-(--color-primary) hover:underline decoration-(--color-primary) underline-offset-4 transition-colors">Documentation</a></li>
					<li><a href="https://github.com/abdulmumin1/onlocal" class="hover:text-(--color-primary) hover:underline decoration-(--color-primary) underline-offset-4 transition-colors">Issues</a></li>
				</ul>
			</div>

		</div>

		<div class="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-stone-800">
			<p class="text-stone-600 text-sm mb-4 md:mb-0">
				[C] {new Date().getFullYear()} By <a href="https://yaqeen.me" class="hover:text-(--color-primary-light) hover:underline decoration-(--color-primary) underline-offset-4">[Abdulmumin]</a> X <a href="https://thirdpen.app" class="hover:text-(--color-primary-light)  hover:underline decoration-(--color-primary) underline-offset-4 ">[The Thirdpen Company]</a>
			</p>
			<div class="flex space-x-6">
				<a href="https://github.com/abdulmumin1/onlocal" class="text-stone-500 hover:text-white transition-colors">
					<Github size={20} />
				</a>
				<a href="https://x.com/abdulmuminyqn" class="text-stone-500 hover:text-white transition-colors">
					<Twitter size={20} />
				</a>
			</div>
		</div>
	</div>
</footer>