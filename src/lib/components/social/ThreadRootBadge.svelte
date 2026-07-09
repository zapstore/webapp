<script lang="js">
/**
 * ThreadRootBadge — app/stack/forum badge for the unified root-comment left rail.
 */
import DeletedRootBadge from '$lib/components/community/DeletedRootBadge.svelte';
import ActivityStackMiniBadge from '$lib/components/community/ActivityStackMiniBadge.svelte';
import AppPic from '$lib/components/common/AppPic.svelte';

let {
	/**
	 * @type {{
	 *   label: string,
	 *   iconUrl?: string | null,
	 *   deleted?: boolean,
	 *   isStack?: boolean,
	 *   isApp?: boolean,
	 *   isForum?: boolean,
	 *   identifier?: string | null
	 * }}
	 */
	context,
	appIconUrl = null,
	appName = '',
	appIdentifier = null,
} = $props();
</script>

<div
	class="thread-root-badge"
	class:thread-root-badge--app={!!context?.isApp && !context?.isStack && !context?.deleted}
	class:thread-root-badge--stack={!!context?.isStack && !context?.deleted}
	aria-hidden="true"
>
	{#if context?.deleted}
		<DeletedRootBadge embedded />
	{:else if context?.isStack}
		<ActivityStackMiniBadge />
	{:else if context?.isApp || context?.identifier}
		<div class="thread-root-app-pic-wrap">
			<AppPic
				iconUrl={context?.iconUrl ?? appIconUrl ?? null}
				name={context?.label ?? appName ?? null}
				identifier={context?.identifier ?? appIdentifier ?? null}
				size="xxs"
				className="thread-root-app-pic"
				onClick={() => {}}
			/>
		</div>
	{:else if context?.isForum}
		<img src={context?.iconUrl ?? '/images/emoji/forum.png'} alt="" width="14" height="14" />
	{:else if context?.iconUrl}
		<img src={context.iconUrl} alt="" width="14" height="14" />
	{/if}
</div>

<style>
	.thread-root-badge {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		background: var(--white8);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.thread-root-badge--app,
	.thread-root-badge--stack {
		width: 28px;
		height: 28px;
		padding: 0;
		overflow: hidden;
		background: transparent;
		border: none;
		border-radius: 6px;
	}

	.thread-root-app-pic-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		min-width: 0;
		min-height: 0;
		flex-shrink: 0;
		pointer-events: none;
		border-radius: 6px;
		overflow: hidden;
		isolation: isolate;
		contain: strict;
	}

	.thread-root-app-pic-wrap :global(.thread-root-app-pic) {
		cursor: inherit;
	}

	.thread-root-app-pic-wrap :global(.thread-root-app-pic:hover),
	.thread-root-app-pic-wrap :global(.thread-root-app-pic:active) {
		transform: none;
	}
</style>
