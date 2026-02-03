<script lang="ts">
	import { formatDisplayDate } from '$lib/date';
	import { ArrowRight } from 'lucide-svelte';

	interface PostMeta {
		title?: string;
		date?: string;
		draft?: boolean;
		description?: string;
		category?: string;
	}

	interface Post {
		meta: PostMeta;
		path: string;
	}

	interface PageData {
		posts: Post[];
	}

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Blog - Zapstore</title>
	<meta name="description" content="Latest news, updates and insights from the Zapstore team." />
</svelte:head>

<header class="mb-16">
	<h1 class="text-4xl sm:text-5xl font-bold mb-4">Blog</h1>
	<p class="text-lg text-[var(--color-text-secondary)]">
		Latest news, updates and insights from the Zapstore team.
	</p>
</header>

<div class="space-y-12">
	{#each data.posts as post, i}
		<article class="group">
			<a href="/blog/{post.path}" class="block" data-sveltekit-reload>
				<div class="flex flex-col gap-3">
					<!-- Meta -->
					<div class="flex items-center gap-3 text-sm text-[var(--color-text-tertiary)]">
						{#if post.meta.date}
							<time datetime={post.meta.date}>
								{formatDisplayDate(post.meta.date)}
							</time>
						{/if}
						{#if post.meta.draft}
							<span
								class="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full text-xs font-medium"
							>
								Draft
							</span>
						{/if}
						{#if post.meta.category}
							<span
								class="px-2 py-0.5 bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20 rounded-full text-xs"
							>
								{post.meta.category}
							</span>
						{/if}
					</div>

					<!-- Title -->
					<h2
						class="text-2xl font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors"
					>
						{post.meta.title}
					</h2>

					<!-- Description -->
					{#if post.meta.description}
						<p class="text-[var(--color-text-secondary)] leading-relaxed">
							{post.meta.description}
						</p>
					{/if}

					<!-- Read more -->
					<span
						class="inline-flex items-center text-sm font-medium text-[var(--color-text-tertiary)] group-hover:text-[var(--color-accent)] transition-colors"
					>
						Read article
						<ArrowRight class="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
					</span>
				</div>
			</a>

			{#if i < data.posts.length - 1}
				<div class="mt-12 border-b border-[var(--color-border)]/50"></div>
			{/if}
		</article>
	{/each}
</div>
