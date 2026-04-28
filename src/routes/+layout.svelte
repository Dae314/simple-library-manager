<script lang="ts">
	import '../app.css';
	import Navbar from '$lib/components/Navbar.svelte';
	import { Toaster } from 'svelte-hot-french-toast';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: { conventionName: string; weightUnit: string }; children: Snippet } = $props();
</script>

<Toaster />
<Navbar conventionName={data.conventionName} />

<main style="padding: 1rem;">
	{@render children()}
</main>
