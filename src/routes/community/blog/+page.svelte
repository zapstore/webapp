<script lang="js">
	/**
	 * Community Blog — same posts as /blog, displayed in the community right-hand content area.
	 * Posts come from src/content/blog (same as main blog).
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
			{#each data.posts as post, i (post.path)}
				<article class="post-item group">
					<a href="/community/blog/{post.path}" class="post-link">
						<div class="post-content">
							<div class="post-meta">
								{#if post.meta.date}
									<time datetime={post.meta.date} class="post-date">
										{formatDisplayDate(post.meta.date)}
									</time>
								{/if}
								{#if post.meta.draft}
									<span class="badge badge-draft">Draft</span>
								{/if}
								{#if post.meta.category}
									<span class="badge badge-category">{post.meta.category}</span>
								{/if}
							</div>

							<h2 class="post-title">{post.meta.title}</h2>

							{#if post.meta.description}
								<p class="post-desc">{post.meta.description}</p>
							{/if}

							<span class="read-more">Read article</span>
						</div>
					</a>

					{#if i < data.posts.length - 1}
						<div class="post-divider"></div>
					{/if}
				</article>
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
		max-width: 680px;
	}

	.post-item {
		padding: 0;
	}

	.post-link {
		display: block;
		text-decoration: none;
		padding: 24px 16px;
		transition: background 0.15s ease;
	}

	.post-link:hover {
		background: hsl(var(--white4));
	}

	.post-content {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.post-meta {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.8125rem;
		color: hsl(var(--white33));
	}

	.post-date {
		color: hsl(var(--white33));
	}

	.badge {
		padding: 2px 8px;
		border-radius: 9999px;
		font-size: 0.75rem;
	}

	.badge-draft {
		background: rgba(245, 158, 11, 0.1);
		color: rgb(251, 191, 36);
		border: 1px solid rgba(245, 158, 11, 0.2);
		font-weight: 500;
	}

	.badge-category {
		background: hsl(var(--blurple) / 0.12);
		color: hsl(var(--blurple-bright-0));
		border: 1px solid hsl(var(--blurple) / 0.25);
	}

	.post-title {
		font-size: 1.25rem;
		font-weight: 650;
		color: hsl(var(--foreground));
		margin: 0;
		line-height: 1.3;
		transition: color 0.15s ease;
	}

	@media (min-width: 768px) {
		.post-title {
			font-size: 1.5rem;
		}
	}

	.post-item:global(.group):hover .post-title,
	.post-link:hover .post-title {
		color: hsl(var(--blurple-bright-0));
	}

	.post-desc {
		font-size: 0.9375rem;
		color: hsl(var(--white66));
		line-height: 1.6;
		margin: 0;
	}

	.read-more {
		display: inline-block;
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--white33));
		transition: color 0.15s ease;
	}

	.post-link:hover .read-more {
		color: hsl(var(--blurple-bright-0));
	}

	.post-divider {
		height: 1px;
		background: hsl(var(--white8));
		margin: 0 16px;
	}
</style>
