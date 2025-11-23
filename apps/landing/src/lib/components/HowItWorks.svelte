<script lang="ts">
	const steps = [
		{
			id: "01",
			title: "npm install -g bun",
			desc: "Prerequisite: Install Bun runtime."
		},
		{
			id: "02",
			title: "node server.js",
			desc: "Start your local application on port 3000."
		},
		{
			id: "03",
			title: "bunx onlocal start 3000",
			desc: "Execute tunnel command. Receive public URL."
		}
	];
</script>

<section id="how-it-works" class="py-24 bg-black text-gray-300 font-mono">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="flex flex-col lg:flex-row gap-16 items-start">

			<div class="flex-1 space-y-12">
				<div>
					<h2 class="text-3xl md:text-4xl font-bold mb-6 text-white">
						<span class="text-green-500">>></span> INIT_SEQUENCE
					</h2>
					<p class="text-gray-500 border-l-2 border-green-900 pl-4">
						Three steps to online status. No registration required.
					</p>
				</div>

				<div class="space-y-8 relative">
					<!-- Vertical Line -->
					<div class="absolute left-[19px] top-0 bottom-0 w-px bg-gray-800 -z-10"></div>

					{#each steps as item}
						<div class="flex gap-6 items-start group">
							<div class="flex-shrink-0 w-10 h-10 bg-black border border-gray-600 text-green-500 font-bold flex items-center justify-center text-sm z-10 group-hover:border-green-500 transition-colors">
								{item.id}
							</div>
							<div class="pt-1">
								<h3 class="text-lg font-bold mb-1 text-white bg-gray-900 px-2 py-1 inline-block">{item.title}</h3>
								<p class="text-gray-500 text-sm mt-2">{item.desc}</p>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div class="flex-1 w-full mt-8 lg:mt-0">
				<div class="border border-white/20 bg-black p-1 relative">
					<div class="absolute -top-3 left-4 bg-black px-2 text-xs text-gray-500 border border-gray-800">src/app.ts</div>
					<div class="p-6 overflow-x-auto text-sm">
						<pre class="font-mono leading-relaxed text-gray-400">
							<code>
<span class="text-purple-400">import</span> {'{ serve }'} <span class="text-purple-400">from</span> <span class="text-green-500">'bun'</span>;

<span class="text-blue-400">const</span> port = <span class="text-yellow-500">3000</span>;

<span class="text-gray-500">// Simple HTTP Server</span>
<span class="text-blue-400">serve</span>({'{'}
  port,
  <span class="text-blue-400">fetch</span>(req) {'{'}
    <span class="text-purple-400">return</span> <span class="text-purple-400">new</span> <span class="text-yellow-500">Response</span>(<span class="text-green-500">"Hello World!"</span>);
  {'}'}
{'}'});

<span class="text-gray-600 mt-4 block border-t border-gray-800 pt-4"># Terminal Output:</span>
<span class="text-white">Listening on http://localhost:3000</span>
							</code>
						</pre>
					</div>
				</div>
			</div>

		</div>
	</div>
</section>