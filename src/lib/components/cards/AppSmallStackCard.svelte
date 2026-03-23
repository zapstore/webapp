<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import AppPic from '../common/AppPic.svelte';
	import Spinner from '../common/Spinner.svelte';
	import { Check } from '../icons';

	/**
	 * AppSmallStackCard - Compact stack card for modal/inline display
	 *
	 * Shows stack title on top, with a row of up to 4 app icons below.
	 * Used in ActionsModal for "Add to Stacks" selection.
	 */

	/** @type {{ stack: { name: string, apps: Array<{ icon?: string, name: string, dTag?: string }> }, selected?: boolean, hasApp?: boolean, loading?: boolean, className?: string, onclick?: (() => void) }} */
	let { 
		stack, 
		selected = false, 
		hasApp = false, 
		loading = false, 
		className = '',
		onclick
	} = $props();

	let iconSize = $state('sm');
	onMount(() => {
		if (!browser) return;
		const mq = window.matchMedia('(max-width: 767px)');
		const update = () => { iconSize = mq.matches ? 'xs' : 'sm'; };
		update();
		mq.addEventListener('change', update);
		return () => mq.removeEventListener('change', update);
	});

	const displayApps = $derived((stack.apps || []).slice(0, 4));
	const gridApps = $derived([...displayApps, ...Array(4 - displayApps.length).fill(null)]);

	function capitalize(text) {
		if (!text) return '';
		return text.charAt(0).toUpperCase() + text.slice(1);
	}

	const displayTitle = $derived(capitalize(stack.name) || 'Untitled');

	function handleClick(e) {
		e.preventDefault();
		e.stopPropagation();
		console.log('[AppSmallStackCard] Click! loading:', loading, 'onclick:', !!onclick);
		if (!loading && onclick) {
			console.log('[AppSmallStackCard] Calling onclick...');
			onclick();
		} else {
			console.log('[AppSmallStackCard] Click blocked - loading:', loading, 'has onclick:', !!onclick);
		}
	}
</script>

<button
	type="button"
	class="small-stack-card {className}"
	class:selected
	class:loading
	onclick={handleClick}
>
	<div class="title-row">
		<span class="stack-title">{displayTitle}</span>
		{#if loading}
			<Spinner size={14} color="hsl(var(--white66))" />
		{:else if hasApp}
			<Check variant="outline" size={16} color="hsl(var(--blurpleLightColor))" strokeWidth={2.8} />
		{/if}
	</div>
	<div class="icons-row">
		{#each gridApps as app, i (i)}
			<div class="icon-slot">
				{#if app}
					<AppPic iconUrl={app.icon} name={app.name} identifier={app.dTag} size={iconSize} />
				{:else}
					<div class="empty-slot"></div>
				{/if}
			</div>
		{/each}
	</div>
</button>

<style>
	.small-stack-card {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		width: 208px;
		height: 100px;
		padding: 10px 12px 12px 12px;
		background-color: hsl(var(--black33));
		border: 1.4px solid hsl(var(--white16));
		border-radius: 16px;
		cursor: pointer;
		flex-shrink: 0;
		box-sizing: border-box;
	}

	.small-stack-card.loading {
		cursor: wait;
		opacity: 0.7;
	}

	.small-stack-card.selected {
		border-color: hsl(var(--primary));
	}

	.title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
	}

	.stack-title {
		font-size: 15px;
		font-weight: 600;
		color: hsl(var(--white));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		text-align: left;
	}

	.icons-row {
		display: flex;
		gap: 8px;
		margin-top: auto;
	}

	.icon-slot {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
	}

	.empty-slot {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		background-color: hsl(var(--white8));
	}

	@media (max-width: 767px) {
		.small-stack-card {
			width: 176px;
			height: 88px;
		}

		.stack-title {
			font-size: 14px;
		}

		.icons-row {
			gap: 8px;
		}

		.icon-slot {
			width: 32px;
			height: 32px;
		}

		.empty-slot {
			width: 32px;
			height: 32px;
			border-radius: 8px;
		}
	}
</style>
