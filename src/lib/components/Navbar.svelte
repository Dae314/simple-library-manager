<script lang="ts">
	import { page } from '$app/state';

	let { conventionName }: { conventionName: string } = $props();

	let menuOpen = $state(false);

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/library') {
			return path === '/library' || path.startsWith('/library/');
		}
		if (href === '/management') {
			return path === '/management' || path.startsWith('/management/');
		}
		return path === href;
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
		<a href="/library" class="nav-link" class:active={isActive('/library')}>Library</a>
		<a href="/management" class="nav-link manage-link" class:active={isActive('/management')}>
			<svg
				class="gear-icon"
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="3" />
				<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
			</svg>
			Manage
		</a>
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
			<a
				href="/library"
				class="mobile-link"
				class:active={isActive('/library')}
				role="menuitem"
				onclick={closeMenu}
			>Library</a>
			<a
				href="/management"
				class="mobile-link"
				class:active={isActive('/management')}
				role="menuitem"
				onclick={closeMenu}
			>
				<svg
					class="gear-icon"
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="3" />
					<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
				</svg>
				Manage
			</a>
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

	.manage-link {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.gear-icon {
		flex-shrink: 0;
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
		display: flex;
		align-items: center;
		gap: 0.35rem;
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
		.nav-links {
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
