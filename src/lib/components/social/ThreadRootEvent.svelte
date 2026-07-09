<script lang="js">
/**
 * ThreadRootEvent — root app/stack/forum label row (badge lives on unified left rail).
 */
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
	onNavigate = null,
} = $props();

const href = $derived(String(context?.href ?? '').trim());
const isNavigable = $derived(!context?.deleted && href.length > 0);
const showVersion = $derived(!!version && !context?.isStack && !context?.deleted);
</script>

<div class="thread-root-event">
	{#if isNavigable}
		<a {href} class="thread-root-label-row thread-root-label-row--link" onclick={onNavigate}>
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

<style>
	.thread-root-event {
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
