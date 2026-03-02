<script lang="js">
import { formatDisplayDate } from '$lib/date';
import { ArrowRight } from 'lucide-svelte';
import SectionHeader from '$lib/components/cards/SectionHeader.svelte';
let { data } = $props();
</script>

<svelte:head>
	<title>Blog - Zapstore</title>
	<meta name="description" content="Latest news, updates and insights from the Zapstore team." />
</svelte:head>

<section class="blog-page">
	<div class="container mx-auto py-6 px-3 sm:px-6 lg:px-8">
		<SectionHeader title="Blog" />
		<div class="posts-list">
			{#each data.posts as post, i}
				<article class="post-item group">
					<a href="/blog/{post.path}" class="post-link" data-sveltekit-reload>
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

							<span class="read-more">
								Read article
								<ArrowRight class="read-more-icon" />
							</span>
						</div>
					</a>

					{#if i < data.posts.length - 1}
						<div class="post-divider"></div>
					{/if}
				</article>
			{/each}
		</div>
	</div>
</section>

<style>
	.blog-page {
		min-height: 100vh;
	}

	.posts-list {
		max-width: 680px;
	}

	.post-item {
		padding: 0;
	}

	.post-link {
		display: block;
		text-decoration: none;
		padding: 24px 0;
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
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--white33));
		transition: color 0.15s ease;
	}

	.post-link:hover .read-more {
		color: hsl(var(--blurple-bright-0));
	}

	.read-more :global(.read-more-icon) {
		width: 14px;
		height: 14px;
		transition: transform 0.15s ease;
	}

	.post-link:hover .read-more :global(.read-more-icon) {
		transform: translateX(2px);
	}

	.post-divider {
		height: 1px;
		background: hsl(var(--white8));
	}
</style>
