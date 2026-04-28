<script lang="ts">
	import { page } from '$app/state';

	let { conventionName }: { conventionName: string } = $props();

	let menuOpen = $state(false);

	const primaryLinks = [
		{ href: '/checkout', label: 'Checkout' },
		{ href: '/checkin', label: 'Checkin' }
	];

	const secondaryLinks = [
		{ href: '/catalog', label: 'Catalog' },
		{ href: '/statistics', label: 'Statistics' },
		{ href: '/management', label: 'Management' },
		{ href: '/management/config', label: 'Config' }
	];

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/management') {
			return path === '/management' || (path.startsWith('/management') && !path.startsWith('/management/config'));
		}
		return path === href || path.startsWith(href + '/');
	}

	function closeMenu() {
		menuOpen = false;
	}
</script>

<nav aria-label="Main navigation" class="navbar">
	<a href="/" class="brand" onclick={closeMenu}>
		{conventionName || 'Board Game Library'}
	</a>

	<div class="nav-links">
		{#each primaryLinks as link (link.href)}
			<a href={link.href} class="nav-link" class:active={isActive(link.href)}>{link.label}</a>
		{/each}

		<span class="desktop-links">
			{#each secondaryLinks as link (link.href)}
				<a href={link.href} class="nav-link" class:active={isActive(link.href)}>{link.label}</a>
			{/each}
		</span>
	</div>

	<button
		class="hamburger"
		aria-expanded={menuOpen}
		aria-controls="mobile-menu"
		aria-label="Toggle navigation menu"
		onclick={() => (menuOpen = !menuOpen)}
	>
		<span class="hamburger-bar"></span>
		<span class="hamburger-bar"></span>
		<span class="hamburger-bar"></span>
	</button>

	{#if menuOpen}
		<div id="mobile-menu" class="mobile-menu" role="menu">
			{#each secondaryLinks as link (link.href)}
				<a
					href={link.href}
					class="mobile-link"
					class:active={isActive(link.href)}
					role="menuitem"
					onclick={closeMenu}
				>{link.label}</a>
			{/each}
		</div>
	{/if}
</nav>

<style>
	.navbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background-color: #1a1a2e;
		color: #eee;
		position: relative;
		flex-wrap: wrap;
	}

	.brand {
		font-weight: 700;
		font-size: 1.1rem;
		color: #fff;
		text-decoration: none;
		margin-right: auto;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 200px;
	}

	.brand:hover {
		color: #a8d8ea;
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.nav-link {
		color: #ccc;
		text-decoration: none;
		padding: 0.4rem 0.75rem;
		border-radius: 4px;
		font-size: 0.9rem;
		transition: background-color 0.15s, color 0.15s;
	}

	.nav-link:hover {
		background-color: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	.nav-link.active {
		background-color: rgba(255, 255, 255, 0.15);
		color: #fff;
		font-weight: 600;
	}

	.desktop-links {
		display: flex;
		gap: 0.25rem;
	}

	.hamburger {
		display: none;
		flex-direction: column;
		justify-content: center;
		gap: 4px;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.5rem;
		margin-left: 0.25rem;
	}

	.hamburger-bar {
		display: block;
		width: 22px;
		height: 2px;
		background-color: #eee;
		border-radius: 1px;
		transition: transform 0.2s;
	}

	.mobile-menu {
		display: none;
		flex-direction: column;
		width: 100%;
		padding: 0.25rem 0;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.mobile-link {
		color: #ccc;
		text-decoration: none;
		padding: 0.6rem 1rem;
		font-size: 0.9rem;
		transition: background-color 0.15s, color 0.15s;
	}

	.mobile-link:hover {
		background-color: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	.mobile-link.active {
		background-color: rgba(255, 255, 255, 0.15);
		color: #fff;
		font-weight: 600;
	}

	@media (max-width: 767px) {
		.desktop-links {
			display: none;
		}

		.hamburger {
			display: flex;
		}

		.mobile-menu {
			display: flex;
		}
	}
</style>
