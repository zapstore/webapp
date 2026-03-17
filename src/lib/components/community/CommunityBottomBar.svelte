<script lang="js">
/**
 * CommunityBottomBar - Fixed bottom bar for community feed view.
 * Feed mode: + Post button + Search Forum. Matches chateau-web layout.
 */
import { Plus, Search } from '$lib/components/icons';

let {
	showFeedBar = false,
	selectedSection = 'forum',
	modalOpen = false,
	onAdd = () => {},
	onSearch = () => {},
	className = ''
} = $props();

const SECTION_CTA = { forum: 'Post', tasks: 'Task', projects: 'Project', blog: 'Post', activity: 'Post' };
const SECTION_SEARCH_LABEL = { forum: 'Search Forum', tasks: 'Search Tasks', blog: 'Search', activity: 'Search' };
const ctaLabel = $derived(SECTION_CTA[selectedSection] ?? 'Post');
const searchLabel = $derived(SECTION_SEARCH_LABEL[selectedSection] ?? 'Search');
</script>

<div class="bottom-bar-wrapper {className}" class:modal-open={modalOpen}>
	<div class="bottom-bar">
		<div class="bottom-bar-content">
			{#if showFeedBar}
				<button type="button" class="post-btn post-btn-feed" onclick={onAdd} aria-label="New {ctaLabel}">
					<Plus variant="outline" size={16} strokeWidth={2.8} color="hsl(var(--whiteEnforced))" />
					<span>{ctaLabel}</span>
				</button>
				<button type="button" class="search-forum-btn" onclick={onSearch} aria-label={searchLabel}>
					<Search variant="outline" size={18} strokeWidth={1.4} color="hsl(var(--white33))" />
					<span>{searchLabel}</span>
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.bottom-bar-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 40;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.bottom-bar {
		flex-shrink: 0;
		align-self: center;
		width: 100%;
		max-width: 100%;
		margin: 0;
		background: hsl(var(--gray66));
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid hsl(var(--white8));
		border-bottom: none;
		box-shadow: 0 -4px 24px hsl(var(--black));
		padding: 12px;
		pointer-events: auto;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		max-height: 88px;
		overflow: hidden;
		transition:
			transform 0.25s cubic-bezier(0.33, 1, 0.68, 1),
			opacity 0.2s ease;
	}

	.modal-open .bottom-bar {
		transform: translateY(100%);
		opacity: 0;
		pointer-events: none;
	}

	.bottom-bar-content {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.post-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 32px;
		min-height: 32px;
		padding: 0 20px 0 18px;
		flex-shrink: 0;
		background: var(--gradient-blurple);
		border: none;
		border-radius: var(--radius-16);
		cursor: pointer;
		color: hsl(var(--whiteEnforced));
		font-size: 16px;
		font-weight: 500;
		transition: transform 0.2s ease, box-shadow 0.2s ease;
		transform: scale(1);
	}

	.post-btn:hover {
		transform: scale(1.015);
		box-shadow:
			0 0 20px hsl(var(--primary) / 0.4),
			0 10px 40px -20px hsl(var(--primary) / 0.6);
	}

	.post-btn:active {
		transform: scale(0.98);
	}

	.post-btn.post-btn-feed {
		padding: 0 20px 0 14px;
	}

	.search-forum-btn {
		flex: 1;
		min-width: 0;
		height: 38px;
		min-height: 38px;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 8px;
		padding: 0 16px;
		background: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white33));
		border-radius: var(--radius-16);
		cursor: pointer;
		color: hsl(var(--white33));
		font-size: 16px;
		font-weight: 500;
		text-align: left;
	}

	.search-forum-btn span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (max-width: 767px) {
		.bottom-bar {
			padding: 16px;
		}

		.post-btn {
			height: 38px;
			min-height: 38px;
		}
	}

	@media (min-width: 768px) {
		.bottom-bar {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid hsl(var(--white8));
			box-shadow: 0 40px 64px 12px hsl(var(--black));
		}

		.post-btn {
			height: 42px;
			min-height: 42px;
		}

		.search-forum-btn {
			height: 42px;
			min-height: 42px;
		}
	}
</style>
