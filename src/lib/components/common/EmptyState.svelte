<script lang="js">
/**
 * EmptyState - Consistent empty state panel (discover-style by default).
 * Use across profile, SocialTabs, discover, etc. Min height can be overridden for tall areas (e.g. SocialTabs).
 * topAlign: when true, text sits ~200px from the top instead of being vertically centered.
 * compact: smaller padding for nested contexts (e.g. modal) without default 50px vertical text padding.
 */
let { message = '', minHeight, topAlign = false, compact = false } = $props();
</script>

<div
	class="empty-state-panel"
	class:top-align={topAlign}
	class:compact={compact}
	style={minHeight != null ? `min-height: ${typeof minHeight === 'number' ? `${minHeight}px` : minHeight};` : ''}
>
	<p class="empty-state-text">{message}</p>
</div>

<style>
	.empty-state-panel {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--gray16);
		border-radius: var(--radius-16, 16px);
	}

	.empty-state-panel.top-align {
		align-items: flex-start;
		justify-content: center;
	}

	.empty-state-panel.top-align .empty-state-text {
		padding-top: 128px;
		padding-bottom: 50px;
	}

	.empty-state-text {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--white16);
		text-align: center;
		padding: 50px 0;
		margin: 0;
	}

	.empty-state-panel.compact .empty-state-text {
		padding: 16px 20px 20px;
	}
</style>
