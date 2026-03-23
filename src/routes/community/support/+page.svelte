<script lang="js">
	import {
		SIGNAL_DEV_SUPPORT_GROUP_URL,
		SIGNAL_USER_SUPPORT_GROUP_URL
	} from '$lib/constants.js';
</script>

<svelte:head>
	<title>Support — Zapstore</title>
	<meta
		name="description"
		content="Join Zapstore user and developer support groups on Signal."
	/>
</svelte:head>

<div class="support-page">
	<h1 class="support-title">Support</h1>
	<p class="support-lead text-muted-foreground">
		Get help from the team and community on Signal.
	</p>
	<div class="support-panels">
		<a
			href={SIGNAL_USER_SUPPORT_GROUP_URL}
			class="panel panel-clickable panel-p-20 support-panel"
			target="_blank"
			rel="noopener noreferrer"
		>
			<span class="support-panel-label">User support</span>
			<span class="support-panel-hint">Signal group</span>
		</a>
		<a
			href={SIGNAL_DEV_SUPPORT_GROUP_URL}
			class="panel panel-clickable panel-p-20 support-panel"
			target="_blank"
			rel="noopener noreferrer"
		>
			<span class="support-panel-label">Developer support</span>
			<span class="support-panel-hint">Signal group</span>
		</a>
	</div>
</div>

<style>
	.support-page {
		padding: 1.5rem 1rem 2rem;
		max-width: 36rem;
		margin: 0 auto;
	}

	.support-title {
		font-size: 1.5rem;
		font-weight: 650;
		letter-spacing: -0.02em;
		color: hsl(var(--foreground));
		margin: 0 0 0.5rem;
	}

	.support-lead {
		font-size: 0.9375rem;
		line-height: 1.5;
		margin: 0 0 1.5rem;
	}

	.support-panels {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.support-panel {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
		text-decoration: none;
		color: inherit;
	}

	.support-panel-label {
		font-weight: 600;
		font-size: 1rem;
		color: hsl(var(--foreground));
	}

	.support-panel-hint {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
	}
</style>
