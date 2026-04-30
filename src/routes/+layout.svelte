<script lang="ts">
	import '../app.css';
	import Navbar from '$lib/components/Navbar.svelte';
	import { Toaster } from 'svelte-hot-french-toast';
	import { setContext } from 'svelte';
	import { page } from '$app/stores';
	import { createWebSocketClient } from '$lib/stores/websocket.svelte.js';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: { conventionName: string; weightUnit: string }; children: Snippet } = $props();

	const wsClient = createWebSocketClient();
	wsClient.setGetPathname(() => $page.url.pathname);

	setContext('ws', wsClient);

	$effect(() => {
		wsClient.connect();
		return () => {
			wsClient.disconnect();
		};
	});
</script>

<Toaster />
<Navbar conventionName={data.conventionName} />

<main style="padding: 1rem;">
	{@render children()}
</main>
