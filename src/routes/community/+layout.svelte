<script lang="js">
	/**
	 * Community layout — sidebar + content. Section derived from URL.
	 */
	import { page } from '$app/stores';
	import { ChevronDown } from '$lib/components/icons';

	let { children } = $props();

	const SECTIONS = [
		{ id: 'forum', label: 'Forum', icon: '/images/emoji/forum.png', href: '/community/forum' },
		{ id: 'blog', label: 'Blog', icon: '/images/emoji/article.png', href: '/blog' },
		{ id: 'activity', label: 'Activity', icon: '/images/emoji/activity.png', href: '/community/activity' }
	];

	const path = $derived($page.url.pathname);
	const activeSection = $derived(
		path.startsWith('/community/forum') ? 'forum' : path.startsWith('/community/activity') ? 'activity' : 'blog'
	);
	const activeSectionLabel = $derived(SECTIONS.find((s) => s.id === activeSection)?.label ?? 'Forum');

	let sectionMenuOpen = $state(false);

	function onKeydown(e) {
		if (e.key === 'Escape') {
			sectionMenuOpen = false;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="dashboard-outer container mx-auto px-0 sm:px-6 lg:px-8">
	<div class="dashboard" style="background: hsl(var(--background));">
		<!-- Section switcher — mobile only -->
		<div class="section-switcher">
			{#if sectionMenuOpen}
				<div class="section-switcher-panel">
					<a href={SECTIONS.find((s) => s.id === activeSection)?.href ?? '/community/forum'} class="section-switcher-zone">
						<span class="section-switcher-label">{activeSectionLabel}</span>
						<span class="section-chevron open">
							<ChevronDown variant="outline" color="hsl(var(--white33))" size={14} strokeWidth={1.4} />
						</span>
					</a>
					<div class="section-switcher-content">
						{#each SECTIONS as section}
							<a
								href={section.href}
								class="section-item"
								class:active={activeSection === section.id}
								onclick={() => { sectionMenuOpen = false; }}
							>
								{#if section.icon}
									<img src={section.icon} alt="" class="section-item-icon" />
								{/if}
								{section.label}
							</a>
						{/each}
					</div>
				</div>
			{:else}
				<button type="button" class="section-switcher-zone" onclick={() => { sectionMenuOpen = true; }}>
					<span class="section-switcher-label">{activeSectionLabel}</span>
					<span class="section-chevron">
						<ChevronDown variant="outline" color="hsl(var(--white33))" size={14} strokeWidth={1.4} />
					</span>
				</button>
			{/if}
		</div>

		<!-- Sidebar — desktop only -->
		<aside class="sidebar">
			<nav class="sidebar-nav">
				{#each SECTIONS as section}
					<a
						href={section.href}
						class="nav-item"
						class:active={activeSection === section.id}
					>
						<span class="icon-wrap" class:icon-emoji={!!section.icon}>
							{#if section.icon}
								<img src={section.icon} alt="" class="section-icon" />
							{:else}
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
									<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
								</svg>
							{/if}
						</span>
						<span class="nav-label">{section.label}</span>
					</a>
				{/each}
			</nav>
		</aside>

		<div class="content right-page-viewport">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.dashboard {
		display: flex;
		height: calc(100dvh - 64px);
		min-height: 0;
		overflow: hidden;
		border-left: 1px solid hsl(var(--border));
		border-right: 1px solid hsl(var(--border));
		margin-left: -16px;
		margin-right: -16px;
	}

	@media (max-width: 639px) {
		.dashboard {
			margin-left: -4px;
			margin-right: -4px;
		}
	}

	@media (max-width: 767px) {
		.dashboard {
			border-left: none;
			border-right: none;
			margin-left: 0;
			margin-right: 0;
			flex-direction: column;
		}
	}

	.section-switcher {
		display: none;
	}

	@media (max-width: 767px) {
		.section-switcher {
			display: block;
			flex-shrink: 0;
		}
	}

	.section-switcher-zone {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 10px 16px;
		background: transparent;
		border: none;
		border-bottom: 1px solid hsl(var(--border));
		cursor: pointer;
		color: hsl(var(--foreground));
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
	}

	.section-switcher-label {
		font-size: 14px;
		font-weight: 500;
	}

	.section-chevron {
		display: flex;
		align-items: center;
		transition: transform 0.2s;
	}

	.section-chevron.open {
		transform: rotate(180deg);
	}

	.section-switcher-panel {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: hsl(var(--background));
		display: flex;
		flex-direction: column;
		overflow-y: auto;
	}

	.section-switcher-panel .section-switcher-zone {
		flex-shrink: 0;
	}

	.section-switcher-content {
		flex: 1;
		padding: 8px 4px 24px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.section-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: hsl(var(--white66));
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: color 0.15s, background 0.15s;
		text-decoration: none;
	}

	.section-item:hover:not(.active) {
		background: hsl(var(--white4));
	}

	.section-item.active {
		color: hsl(var(--foreground));
		background: hsl(var(--white8));
	}

	.sidebar {
		width: 260px;
		flex-shrink: 0;
		padding: 12px;
		display: flex;
		flex-direction: column;
	}

	@media (max-width: 767px) {
		.sidebar {
			display: none;
		}
	}

	.sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: hsl(var(--white66));
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: color 0.15s, background 0.15s;
		text-decoration: none;
	}

	.nav-item:hover:not(.active) {
		background: hsl(var(--white4));
	}

	.nav-item.active {
		color: hsl(var(--foreground));
		background: hsl(var(--white8));
	}

	.icon-wrap {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-wrap.icon-emoji {
		opacity: 0.66;
	}

	.nav-item.active .icon-wrap.icon-emoji {
		opacity: 1;
	}

	.section-icon {
		width: 18px;
		height: 18px;
		object-fit: contain;
	}

	.section-item-icon {
		width: 18px;
		height: 18px;
		object-fit: contain;
		opacity: 0.66;
		flex-shrink: 0;
	}

	.section-item.active .section-item-icon {
		opacity: 1;
	}

	.right-page-viewport {
		position: relative;
		transform: translateZ(0);
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		border-left: 1px solid hsl(var(--border));
		background: hsl(var(--background));
		min-height: 0;
	}

	@media (max-width: 767px) {
		.content {
			border-left: none;
		}
	}
</style>
