<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Snippet } from 'svelte';

	let { data, form, children }: {
		data: { isPasswordSet: boolean; isAuthenticated: boolean };
		form: Record<string, any> | null;
		children: Snippet;
	} = $props();
</script>

{#if data.isAuthenticated}
	{@render children()}
{:else}
	<div class="auth-gate">
		<div class="auth-card">
			<div class="auth-icon" aria-hidden="true">🔒</div>
			<h1>Management Access</h1>
			<p class="auth-description">Enter the management password to continue.</p>

			<form method="POST" action="?/login" use:enhance={() => {
				return async ({ result, update }) => {
					await update({ reset: false });
				};
			}}>
				<div class="form-group">
					<label for="password">Password</label>
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						required
					/>
					{#if form?.loginError}
						<span class="field-error" role="alert">{form.loginError}</span>
					{/if}
				</div>

				<button type="submit" class="btn-login">Unlock</button>
			</form>
		</div>
	</div>
{/if}

<style>
	.auth-gate {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding-top: 4rem;
		min-height: 60vh;
	}

	.auth-card {
		width: 100%;
		max-width: 380px;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 2rem 1.5rem;
		text-align: center;
	}

	.auth-icon {
		font-size: 2rem;
		margin-bottom: 0.75rem;
	}

	h1 {
		font-size: 1.25rem;
		font-weight: 700;
		color: #111827;
		margin-bottom: 0.35rem;
	}

	.auth-description {
		font-size: 0.85rem;
		color: #6b7280;
		margin-bottom: 1.25rem;
	}

	.form-group {
		text-align: left;
		margin-bottom: 1rem;
	}

	.form-group label {
		display: block;
		font-size: 0.85rem;
		font-weight: 500;
		color: #374151;
		margin-bottom: 0.25rem;
	}

	.form-group input {
		width: 100%;
		padding: 0.5rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.9rem;
		outline: none;
		transition: border-color 0.15s;
	}

	.form-group input:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
	}

	.field-error {
		display: block;
		font-size: 0.8rem;
		color: #ef4444;
		margin-top: 0.25rem;
	}

	.btn-login {
		width: 100%;
		padding: 0.55rem;
		background-color: #6366f1;
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.btn-login:hover {
		background-color: #4f46e5;
	}
</style>
