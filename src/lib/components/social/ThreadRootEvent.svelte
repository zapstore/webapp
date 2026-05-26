<script lang="js">
/**
 * ThreadRootEvent — root app/stack/forum row at the top of opened comment thread modals.
 * Same presentation everywhere: badge, short connector line, label (+ optional version).
 * Clickable when `href` is set; no chevron or hover background treatment.
 */
import DeletedRootBadge from '$lib/components/community/DeletedRootBadge.svelte';
import ActivityStackMiniBadge from '$lib/components/community/ActivityStackMiniBadge.svelte';
import AppPic from '$lib/components/common/AppPic.svelte';

let {
	/**
	 * @type {{
	 *   label: string,
	 *   iconUrl?: string | null,
	 *   href?: string | null,
	 *   deleted?: boolean,
	 *   isStack?: boolean,
	 *   isApp?: boolean,
	 *   isForum?: boolean,
	 *   identifier?: string | null
	 * }}
	 */
	context,
	version = '',
	appIconUrl = null,
	appName = '',
	appIdentifier = null,
	onNavigate = null,
} = $props();

const href = $derived(String(context?.href ?? '').trim());
const isNavigable = $derived(!context?.deleted && href.length > 0);
const showVersion = $derived(
	!!version && !context?.isStack && !context?.deleted
);
</script>

<div class="thread-root-event">
	<div class="thread-root-event-rail">
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
				<img
					src={context?.iconUrl ?? '/images/emoji/forum.png'}
					alt=""
					width="14"
					height="14"
				/>
			{:else if context?.iconUrl}
				<img src={context.iconUrl} alt="" width="14" height="14" />
			{/if}
		</div>
		<div class="thread-root-line-solid" aria-hidden="true"></div>
	</div>

	<div class="thread-root-event-main">
		{#if isNavigable}
			<a
				{href}
				class="thread-root-label-row thread-root-label-row--link"
				onclick={onNavigate}
			>
				<div class="thread-root-label-main">
					<span class="thread-root-label" class:thread-root-label--split={!!context?.isStack}>
						{#if context?.isStack}
							<span class="thread-root-label-kind">Stack</span>
							<span class="thread-root-label-ellipsis">{context.label}</span>
						{:else}
							{context.label}
						{/if}
					</span>
					{#if showVersion}
						<span class="thread-root-version-tag">v{version}</span>
					{/if}
				</div>
			</a>
		{:else}
			<div
				class="thread-root-label-row"
				class:thread-root-label-row--deleted={context?.deleted}
				role={context?.deleted ? 'status' : undefined}
			>
				<div class="thread-root-label-main">
					<span
						class="thread-root-label"
						class:thread-root-label--deleted={context?.deleted}
						class:thread-root-label--split={!!context?.isStack}
					>
						{#if context?.isStack}
							<span class="thread-root-label-kind">Stack</span>
							<span class="thread-root-label-ellipsis">{context.label}</span>
						{:else}
							{context.label}
						{/if}
					</span>
					{#if showVersion}
						<span class="thread-root-version-tag">v{version}</span>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.thread-root-event {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		padding: 16px 16px 0;
	}

	.thread-root-event-rail {
		width: 36px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

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

	.thread-root-line-solid {
		width: 2px;
		height: 9px;
		flex-shrink: 0;
		margin-top: -2px;
		background: var(--white16);
	}

	.thread-root-event-main {
		flex: 1;
		min-width: 0;
	}

	.thread-root-label-row {
		width: 100%;
		height: 28px;
		display: flex;
		align-items: center;
		min-width: 0;
		gap: 8px;
		text-decoration: none;
		color: inherit;
	}

	.thread-root-label-row--link {
		cursor: pointer;
	}

	.thread-root-label-row--deleted {
		color: var(--white33);
	}

	.thread-root-label-main {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.thread-root-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--white66);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.thread-root-label--deleted {
		color: var(--white33);
	}

	.thread-root-label--split {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		max-width: 100%;
		min-width: 0;
	}

	.thread-root-label-kind {
		flex-shrink: 0;
		color: var(--white33);
	}

	.thread-root-label-ellipsis {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.thread-root-version-tag {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--white33);
		white-space: nowrap;
		line-height: 1.4;
		flex-shrink: 0;
	}
</style>
