<!-- Hero image: replace static/hero.svg with your convention's own banner image -->
<script lang="ts">
	import { page } from '$app/stores';

	const conventionName = $derived($page.data.conventionName as string);
</script>

<div class="landing">
	<div class="hero-banner">
		<img src="/hero.svg" alt="{conventionName} hero banner" class="hero-image" />
	</div>

	<h1 class="convention-name">{conventionName}</h1>

	<a href="/library" class="cta-button">Browse the Library</a>
</div>

<style>
	.landing {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;
		max-width: 960px;
		margin: 0 auto;
		padding: 1rem 0;
	}

	.hero-banner {
		width: 100%;
		aspect-ratio: 4 / 1;
		overflow: hidden;
		border-radius: 12px;
	}

	.hero-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.convention-name {
		font-size: 2.5rem;
		font-weight: 700;
		text-align: center;
	}

	.cta-button {
		display: inline-block;
		padding: 1rem 2.5rem;
		font-size: 1.25rem;
		font-weight: 600;
		color: #ffffff;
		background-color: #6366f1;
		border-radius: 8px;
		text-decoration: none;
		transition: background-color 0.15s ease;
	}

	.cta-button:hover {
		background-color: #4f46e5;
	}

	.cta-button:focus-visible {
		outline: 2px solid #6366f1;
		outline-offset: 2px;
	}
</style>
