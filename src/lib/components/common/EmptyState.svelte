<script lang="js">
/**
 * EmptyState - Consistent empty state panel (discover-style by default).
 * Use across profile, SocialTabs, discover, etc. Min height can be overridden for tall areas (e.g. SocialTabs).
 */
let { message = '', minHeight } = $props();
</script>

<div
	class="empty-state-panel"
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
		background: hsl(var(--gray16));
		border-radius: var(--radius-16, 16px);
	}

	.empty-state-text {
		font-size: 1.5rem;
		font-weight: 600;
		color: hsl(var(--white16));
		text-align: center;
		padding: 50px 0;
		margin: 0;
	}
</style>
