<script lang="js">
	import { page } from '$app/stores';
	import DocsNavigation from '$lib/components/DocsNavigation.svelte';
	import { ChevronDown } from '$lib/components/icons';

	let {
		navigation = [],
		sidebarTitle = 'Docs',
		showExtraNav = true,
		contentProse = true,
		contentFlush = false,
		children
	} = $props();

	let mobileMenuOpen = $state(false);

	const currentPath = $derived($page.url.pathname);

	const extraNavItems = [
		{ href: '/assets', match: (path) => path === '/assets', label: 'Zapstore Badge & Logo' },
		{ href: '/terms', match: (path) => path === '/terms', label: 'Terms' }
	];

	const activeNavLabel = $derived.by(() => {
		for (const item of extraNavItems) {
			if (item.match(currentPath)) return item.label;
		}
		const label = findNavTitle(navigation ?? [], currentPath);
		return label ?? sidebarTitle;
	});

	function findNavTitle(nodes, path) {
		for (const node of nodes) {
			if (node.href === path) return node.title;
			if (node.children?.length) {
				const child = findNavTitle(node.children, path);
				if (child) return child;
			}
		}
		return null;
	}

	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}

	function onKeydown(e) {
		if (e.key === 'Escape') mobileMenuOpen = false;
	}

	function isExtraActive(item) {
		return item.match(currentPath);
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="dashboard-outer container mx-auto px-0 sm:px-6 lg:px-8">
	<div class="dashboard docs-content">
		<div class="mobile-nav">
			<button
				type="button"
				class="mobile-nav-zone"
				onclick={toggleMobileMenu}
				aria-expanded={mobileMenuOpen}
				aria-haspopup="true"
			>
				<span class="mobile-nav-label">{activeNavLabel}</span>
				<span class="mobile-chevron" class:open={mobileMenuOpen}>
					<ChevronDown variant="outline" color="var(--white33)" size={14} strokeWidth={1.4} />
				</span>
			</button>
			{#if mobileMenuOpen}
				<div class="mobile-nav-panel" role="dialog" aria-modal="true" aria-label="Documentation navigation">
					<div class="mobile-nav-content">
						<h2 class="docs-sidebar-title docs-sidebar-title--mobile">{sidebarTitle}</h2>
						{#if navigation && navigation.length > 0}
							<DocsNavigation navigation={navigation} onNavigate={closeMobileMenu} />
						{:else}
							<p class="nav-loading">Loading navigation…</p>
						{/if}
						{#if showExtraNav}
							<div class="sidebar-more mobile-more">
								<span class="eyebrow-label more-eyebrow">More</span>
								{#each extraNavItems as item (item.href)}
									<a
										href={item.href}
										class="extra-nav-link"
										class:active={isExtraActive(item)}
										onclick={closeMobileMenu}
									>
										{item.label}
									</a>
								{/each}
							</div>
						{/if}
					</div>
					<button
						type="button"
						class="mobile-nav-rest"
						onclick={closeMobileMenu}
						aria-label="Close menu"
					></button>
				</div>
			{/if}
		</div>

		<aside class="sidebar">
			<div class="sidebar-main">
				<h2 class="docs-sidebar-title">{sidebarTitle}</h2>
				{#if navigation && navigation.length > 0}
					<DocsNavigation navigation={navigation} />
				{:else}
					<p class="nav-loading">Loading navigation…</p>
				{/if}
			</div>
			{#if showExtraNav}
				<div class="sidebar-more">
					<span class="eyebrow-label more-eyebrow">More</span>
					{#each extraNavItems as item (item.href)}
						<a href={item.href} class="extra-nav-link" class:active={isExtraActive(item)}>
							{item.label}
						</a>
					{/each}
				</div>
			{/if}
		</aside>

		<main class="content">
			<div
				class="content-inner docs-content max-w-none"
				class:prose={contentProse}
				class:content-inner-flush={contentFlush}
			>
				{@render children()}
			</div>
		</main>
	</div>
</div>

<style>
	.dashboard {
		display: flex;
		align-items: flex-start;
		min-height: calc(100dvh - 64px);
		border-left: 1px solid var(--shell-border);
		border-right: 1px solid var(--shell-border);
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

	.mobile-nav {
		display: none;
	}

	@media (max-width: 767px) {
		.dashboard-outer {
			overflow-x: hidden;
			max-width: 100%;
		}

		.sidebar {
			display: none;
		}

		.mobile-nav {
			display: block;
			position: relative;
			z-index: 90;
			flex-shrink: 0;
		}

		.mobile-nav-zone {
			display: flex;
			align-items: center;
			justify-content: space-between;
			width: 100%;
			padding: 10px 16px;
			background: transparent;
			border: none;
			border-bottom: 1px solid var(--shell-border);
			cursor: pointer;
			color: var(--white);
		}

		.mobile-nav-label {
			font-size: 14px;
			font-weight: 500;
		}

		.mobile-chevron {
			display: flex;
			align-items: center;
			transition: transform 0.2s;
		}

		.mobile-chevron.open {
			transform: rotate(180deg);
		}

		.mobile-nav-panel {
			position: fixed;
			z-index: 89;
			left: 0;
			right: 0;
			top: calc(64px + 2.625rem);
			bottom: 0;
			display: flex;
			flex-direction: column;
			background: var(--black);
			border-top: 1px solid var(--shell-border);
			box-shadow: 0 12px 40px color-mix(in srgb, var(--black) 35%, transparent);
			overflow: hidden;
		}

		.mobile-nav-content {
			flex-shrink: 0;
			max-height: 55dvh;
			overflow-y: auto;
			padding: 8px 4px 8px;
		}

		.mobile-nav-rest {
			flex: 1;
			min-height: 0;
			width: 100%;
			margin: 0;
			padding: 0;
			border: none;
			background: color-mix(in srgb, var(--black) 35%, transparent);
			cursor: default;
		}

		.content {
			border-left: none;
		}
	}

	.sidebar {
		width: 260px;
		flex-shrink: 0;
		padding: 12px;
		display: flex;
		flex-direction: column;
		position: sticky;
		top: 64px;
		align-self: flex-start;
		height: calc(100dvh - 64px);
		max-height: calc(100dvh - 64px);
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
	}

	@media (max-width: 767px) {
		.sidebar {
			display: none;
		}
	}

	.sidebar-main {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.docs-sidebar-title {
		font-size: var(--docs-page-title-size, 1.375rem);
		font-weight: 650;
		letter-spacing: -0.02em;
		line-height: 1.2;
		color: var(--white);
		margin: 0 0 calc(0.5rem + 2px);
		padding: 6px 10px 0;
	}

	.docs-sidebar-title--mobile {
		display: block;
		margin-bottom: calc(0.5rem + 2px);
	}

	@media (min-width: 768px) {
		.docs-sidebar-title {
			font-size: var(--docs-page-title-size-md, 1.5rem);
		}
	}

	.more-eyebrow {
		display: block;
		padding: 0 10px;
		margin-bottom: 4px;
		color: var(--white33);
	}

	.sidebar-more {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-shrink: 0;
		margin-top: auto;
		margin-left: -12px;
		margin-right: -12px;
		padding: 16px 12px 0;
		border-top: 1px solid var(--shell-border);
	}

	.mobile-more {
		margin-top: 16px;
		margin-left: 0;
		margin-right: 0;
		padding: 16px 0 0;
		border-top: 1px solid var(--shell-border);
	}

	.extra-nav-link {
		display: block;
		padding: 8px 12px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: var(--white66);
		font-size: 14px;
		font-weight: 500;
		line-height: 1.3;
		text-decoration: none;
		text-align: left;
		transition: color 0.15s, background 0.15s;
		cursor: pointer;
	}

	.extra-nav-link:hover:not(.active) {
		background: var(--white4);
		color: var(--white);
	}

	.extra-nav-link.active {
		color: var(--white);
		background: var(--white8);
	}

	.content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	@media (min-width: 768px) {
		.content {
			border-left: 1px solid var(--shell-border);
		}
	}

	.content-inner.docs-content {
		--docs-pad-x: 14px;
	}

	@media (min-width: 768px) {
		.content-inner.docs-content {
			--docs-pad-x: 20px;
		}
	}

	.content-inner {
		flex: 1;
		overflow-x: hidden;
		padding: var(--docs-content-pad-top, var(--docs-pad-x, 14px)) var(--docs-pad-x, 14px) 2rem;
	}

	.content-inner.content-inner-flush {
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.nav-loading {
		margin: 0;
		padding: 8px 12px;
		font-size: 14px;
		color: var(--white33);
	}

	:global(.prose .heading-link) {
		text-decoration: none;
		color: inherit;
	}

	:global(.prose .heading-link:hover) {
		text-decoration: none;
	}

	:global(.prose :is(h1, h2, h3, h4, h5, h6) a) {
		text-decoration: none;
		color: inherit;
		pointer-events: none;
	}

	:global(.prose :is(h1, h2, h3, h4, h5, h6) a:hover) {
		text-decoration: none;
	}
</style>
