<script lang="js">
import { page } from '$app/stores';
import { browser } from '$app/environment';
import { isOnline } from '$lib/stores/online.svelte.js';

let online = $derived(browser ? isOnline() : true);
let status = $derived($page.status);
let message = $derived($page.error?.message ?? 'Something went wrong');

let isOfflineError = $derived(
	!online || status === 503 || message.includes('NetworkError') || message.includes('fetch')
);
</script>

<div class="error-page">
	<div class="error-content">
		{#if isOfflineError}
			<div class="error-icon">📡</div>
			<h1 class="error-title">You're offline</h1>
			<p class="error-message">
				This page isn't available offline yet. Try navigating to a page you've visited before, or reconnect to load fresh data.
			</p>
		{:else}
			<div class="error-icon">⚠️</div>
			<h1 class="error-title">{status}</h1>
			<p class="error-message">{message}</p>
		{/if}

		<div class="error-actions">
			<a href="/apps" class="btn-primary">Go to Apps</a>
			<button type="button" class="btn-secondary" onclick={() => history.back()}>
				Go back
			</button>
		</div>
	</div>
</div>

<style>
	.error-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		padding: 2rem;
	}

	.error-content {
		text-align: center;
		max-width: 420px;
	}

	.error-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.error-title {
		font-size: 1.5rem;
		font-weight: 600;
		color: hsl(var(--white));
		margin-bottom: 0.75rem;
	}

	.error-message {
		font-size: 0.9375rem;
		color: hsl(var(--white50));
		line-height: 1.5;
		margin-bottom: 2rem;
	}

	.error-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
	}
</style>
