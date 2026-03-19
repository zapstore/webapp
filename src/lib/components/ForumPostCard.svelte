<script lang="js">
/**
 * Forum Post card — avatar + content column, optional reply row.
 * Content preview: one-line ShortTextPreview (same short format as comments).
 */
import ProfilePic from '$lib/components/common/ProfilePic.svelte';
import Label from '$lib/components/common/Label.svelte';
import ProfilePicStack from '$lib/components/common/ProfilePicStack.svelte';
import ShortTextPreview from '$lib/components/common/ShortTextPreview.svelte';

let {
	author = { name: '', picture: '', npub: '' },
	title = '',
	content = '',
	timestamp = '',
	labels = [],
	/** @type {string[]} Media URLs (images/videos) from post event */
	mediaUrls = [],
	/** @type {{ shortcode: string, url: string }[]} From post's emoji tags (same as comments) */
	emojiTags = [],
	/** @type {{ pubkey: string; displayName?: string; avatarUrl?: string }[]} */
	commenters = [],
	commentCount = 0,
	onClick = () => {}
} = $props();

function handleCardClick(e) {
	if (/** @type {HTMLElement} */ (e.target).closest('[data-short-text-preview]')) return;
	onClick();
}

const hasCommenters = $derived(commenters && commenters.length > 0);
const displayName = $derived(
	author.name || (author.npub ? author.npub.slice(0, 12) + '...' : '') || 'Anonymous'
);
const stackProfiles = $derived(
	(commenters || []).slice(0, 3).map((r) => ({
		pubkey: r.pubkey,
		name: r.displayName ?? '',
		pictureUrl: r.avatarUrl ?? undefined
	}))
);
const stackText = $derived(
	commenters?.length === 1
		? (commenters[0].displayName || 'Someone')
		: commenters?.length === 2
			? `${commenters[0].displayName || 'Someone'} & ${commenters[1].displayName || 'Someone'}`
			: commenters?.length > 2
				? `${commenters[0].displayName || 'Someone'} & ${commenters.length - 1} Others`
				: ''
);
function formatDateTime(ts) {
	if (ts == null || ts === '') return '';
	const date = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
	if (Number.isNaN(date.getTime())) return '';
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);
	if (diffMins < 1) return 'now';
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
</script>

<div
	class="forum-post-card"
	role="button"
	tabindex="0"
	onclick={handleCardClick}
	onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), onClick())}
>
	<div class="top-row">
		<div class="left-column">
			<div class="avatar-wrap">
				<ProfilePic
					pictureUrl={author.picture}
					name={author.name}
					pubkey={author.npub}
					size="smMd"
				/>
			</div>
			{#if hasCommenters}
				<div class="connector-vertical-only"></div>
			{/if}
		</div>
		<div class="right-column">
			<div class="row row-meta">
				<span class="author-name">{displayName}</span>
				<span class="timestamp">{formatDateTime(timestamp)}</span>
			</div>
			{#if title}
				<h3 class="row post-title">{title}</h3>
			{/if}
			{#if content || (mediaUrls && mediaUrls.length > 0)}
				<div class="row content-row">
					<div class="post-content">
						<ShortTextPreview
							content={content ?? ''}
							emojiTags={emojiTags ?? []}
							mediaUrls={mediaUrls ?? []}
							maxLines={1}
							class="post-preview"
						/>
					</div>
				</div>
			{/if}
			{#if labels && labels.length > 0}
				<div class="row labels-row">
					<div class="labels-mask-wrap">
						<div class="labels-scroll">
							{#each labels as label}
								<div class="label-slot">
									<Label text={label} isSelected={false} isEmphasized={false} size="small" />
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
	{#if hasCommenters}
		<div class="reply-row">
			<div class="connector-column">
				<div class="connector-vertical"></div>
				<div class="connector-corner">
					<svg viewBox="0 0 27 16" fill="none">
						<path
							d="M1 0 L1 0 Q1 15 16 15 L27 15"
							stroke="hsl(var(--white16))"
							stroke-width="1.5"
							fill="none"
						/>
					</svg>
				</div>
			</div>
			<div class="repliers-row">
				<ProfilePicStack
					profiles={stackProfiles}
					text={stackText}
					suffix={String(commentCount || commenters.length)}
					size="sm"
					onclick={() => onClick()}
				/>
			</div>
		</div>
	{/if}
</div>


<style>
	.forum-post-card {
		display: flex;
		flex-direction: column;
		background: transparent;
		border: none;
		border-radius: 0;
		border-bottom: 1.4px solid hsl(var(--white11));
		cursor: pointer;
		overflow: visible;
		padding: 16px;
	}

	.forum-post-card:hover,
	.forum-post-card:focus,
	.forum-post-card:active {
		background: transparent;
	}

	.forum-post-card:focus {
		outline: none;
	}

	.top-row {
		display: flex;
		align-items: stretch;
		gap: 0;
	}

	.left-column {
		width: 35px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 2px;
	}

	.avatar-wrap {
		flex-shrink: 0;
	}

	.connector-vertical-only {
		width: 1.5px;
		flex: 1;
		min-height: 8px;
		background: hsl(var(--white16));
		margin-top: 0;
	}

	.right-column {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 0;
	}

	.row {
		margin: 0;
	}

	.row-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 0 0 0 12px;
	}

	.author-name {
		font-weight: 500;
		font-size: 0.9375rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: hsl(var(--white66));
	}

	.timestamp {
		font-size: 0.75rem;
		white-space: nowrap;
		flex-shrink: 0;
		color: hsl(var(--white33));
	}

	.post-title {
		font-size: 1.1875rem;
		font-weight: 600;
		line-height: 1.3;
		color: hsl(var(--white));
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		padding: 0 0 0 12px;
	}

	.content-row {
		padding: 0 0 0 12px;
		margin-top: 2px;
	}

	.post-content {
		font-size: 0.9375rem;
		line-height: 1.45;
		margin: 0;
		color: hsl(var(--white66));
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	@media (min-width: 768px) {
		.post-content {
			-webkit-line-clamp: 1;
			line-clamp: 1;
		}
	}

	.labels-row {
		margin-top: 4px;
		padding: 0;
	}

	.labels-mask-wrap {
		overflow: hidden;
	}

	.labels-scroll {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		scrollbar-width: none;
		-ms-overflow-style: none;
		padding: 0 0 0 12px;
		mask-image: linear-gradient(
			to right,
			transparent 0,
			black 12px,
			black calc(100% - 16px),
			transparent 100%
		);
		-webkit-mask-image: linear-gradient(
			to right,
			transparent 0,
			black 12px,
			black calc(100% - 16px),
			transparent 100%
		);
		mask-size: 100% 100%;
		mask-repeat: no-repeat;
		-webkit-mask-size: 100% 100%;
		-webkit-mask-repeat: no-repeat;
	}

	.labels-scroll::-webkit-scrollbar {
		display: none;
	}

	.label-slot {
		flex-shrink: 0;
	}

	.reply-row {
		display: flex;
		align-items: flex-end;
		margin-left: 17px;
		width: calc(100% - 17px);
	}

	.connector-column {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		width: 27px;
		flex-shrink: 0;
		padding-bottom: 14px;
	}

	.connector-vertical {
		width: 1.5px;
		height: 12px;
		background: hsl(var(--white16));
		margin-left: 0;
	}

	.connector-corner {
		width: 27px;
		height: 16px;
		flex-shrink: 0;
	}

	.connector-corner svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	.repliers-row {
		display: flex;
		align-items: center;
		padding-top: 4px;
		flex: 1;
		min-width: 0;
	}
</style>
