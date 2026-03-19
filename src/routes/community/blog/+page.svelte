<script lang="js">
	/**
	 * Community Blog — same posts as /blog, displayed in the community right-hand content area.
	 * Card layout matches ForumPostCard: author + timestamp in one row, title in the next (no pic, no comments).
	 */
	import { formatDisplayDate } from '$lib/date';

	let { data } = $props();
</script>

<svelte:head>
	<title>Blog — Zapstore</title>
	<meta name="description" content="Latest news, updates and insights from the Zapstore team." />
</svelte:head>

<div class="blog-page-wrap">
	<div class="panel-content">
		<div class="blog-list">
			{#each data.posts as post (post.path)}
				<a href="/community/blog/{post.path}" class="blog-article-card">
					<div class="row row-meta">
						<span class="author-name">Zapstore</span>
						{#if post.meta.date}
							<time datetime={post.meta.date} class="timestamp">{formatDisplayDate(post.meta.date)}</time>
						{/if}
					</div>
					<h3 class="row post-title">{post.meta.title}</h3>
				</a>
			{/each}
		</div>
	</div>
</div>

<style>
	.blog-page-wrap {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		background: hsl(var(--background));
	}

	.panel-content {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		padding: 0;
	}

	.blog-list {
		display: flex;
		flex-direction: column;
		padding: 0;
		gap: 0;
	}

	.blog-article-card {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		text-align: left;
		background: transparent;
		border: none;
		border-radius: 0;
		border-bottom: 1.4px solid hsl(var(--white11));
		cursor: pointer;
		padding: 16px;
		gap: 5px;
		text-decoration: none;
	}

	.blog-article-card:focus {
		outline: none;
	}

	.blog-article-card .row {
		margin: 0;
	}

	.row-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.author-name {
		font-weight: 500;
		font-size: 0.9375rem;
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
		padding: 0;
		margin: 0;
	}

	.blog-article-card:hover .post-title,
	.blog-article-card:focus .post-title {
		color: hsl(var(--blurple-bright-0));
	}
</style>
