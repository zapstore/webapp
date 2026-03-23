<script lang="js">
	/**
	 * AppSidebar - Full-height desktop sidebar for discover, apps, stacks, profile, blog, etc.
	 * Shown on non-marketing pages (everything except / and /studio).
	 * Structure: Zapstore branding | Discover | Community | [spacer] | User profile or Get Started CTA.
	 */
	import { page } from '$app/stores';
	import { LogOut, User, Search } from 'lucide-svelte';
	import { nip19 } from 'nostr-tools';
	import { getCurrentPubkey, signOut } from '$lib/stores/auth.svelte.js';
	import { queryEvent, fetchProfile } from '$lib/nostr';
	import { parseProfile } from '$lib/nostr/models';
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
	import {
		SIGNAL_DEV_SUPPORT_GROUP_URL,
		SIGNAL_USER_SUPPORT_GROUP_URL
	} from '$lib/constants.js';

	let { onGetStarted, onOpenSearch } = $props();

	const path = $derived($page.url.pathname);
	const pubkey = $derived(getCurrentPubkey());
	const isConnected = $derived(pubkey !== null);
	const profileHref = $derived(pubkey ? '/profile/' + nip19.npubEncode(pubkey) : null);

	let userProfile = $state(null);
	let profileDropdownOpen = $state(false);

	$effect(() => {
		const pk = getCurrentPubkey();
		if (!pk) {
			userProfile = null;
			return;
		}
		queryEvent({ kinds: [0], authors: [pk], limit: 1 }).then((ev) => {
			if (ev?.content) {
				try {
					const p = parseProfile(ev);
					userProfile = { picture: p.picture ?? '', name: p.displayName ?? p.name ?? '' };
				} catch {
					userProfile = null;
				}
			}
		});
		fetchProfile(pk).then((e) => {
			if (e?.content) {
				try {
					const p = parseProfile(e);
					userProfile = { picture: p.picture ?? '', name: p.displayName ?? p.name ?? '' };
				} catch {
					// keep existing
				}
			}
		});
	});

	function toggleProfileDropdown(e) {
		e.stopPropagation();
		profileDropdownOpen = !profileDropdownOpen;
	}

	function handleSignOut() {
		signOut();
		profileDropdownOpen = false;
	}

	function handleClickOutside(e) {
		if (profileDropdownOpen && !e.target.closest('.sidebar-user')) {
			profileDropdownOpen = false;
		}
	}

	function isActive(href) {
		if (href === '/') return path === '/';
		if (href === '/apps') return path === '/apps';
		if (href === '/apps') return path === '/apps' || path.startsWith('/apps/');
		if (href === '/stacks') return path === '/stacks' || path.startsWith('/stacks/');
		if (href === '/blog') return path === '/blog' || path.startsWith('/blog/');
		return path === href || path.startsWith(href + '/');
	}
</script>

<svelte:document onclick={handleClickOutside} />

<aside class="app-sidebar" aria-label="App navigation">
	<div class="app-sidebar-inner">
		<!-- Zapstore branding -->
		<a href="/" class="app-sidebar-brand" aria-label="Zapstore home">
			<svg width="19" height="32" viewBox="0 0 19 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="app-sidebar-logo" aria-hidden="true">
				<defs>
					<linearGradient id="sidebar-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
						<stop offset="0%" style="stop-color: var(--blurple-bright-0);" />
						<stop offset="100%" style="stop-color: var(--blurple-bright-1);" />
					</linearGradient>
				</defs>
				<path d="M18.8379 13.9711L8.84956 0.356086C8.30464 -0.386684 7.10438 0.128479 7.30103 1.02073L9.04686 8.94232C9.16268 9.46783 8.74887 9.96266 8.19641 9.9593L0.871032 9.91477C0.194934 9.91066 -0.223975 10.6293 0.126748 11.1916L7.69743 23.3297C7.99957 23.8141 7.73264 24.4447 7.16744 24.5816L5.40958 25.0076C4.70199 25.179 4.51727 26.0734 5.10186 26.4974L12.4572 31.8326C12.9554 32.194 13.6711 31.9411 13.8147 31.3529L15.8505 23.0152C16.0137 22.3465 15.3281 21.7801 14.6762 22.0452L13.0661 22.7001C12.5619 22.9052 11.991 22.6092 11.8849 22.0877L10.7521 16.5224C10.6486 16.014 11.038 15.5365 11.5704 15.5188L18.1639 15.2998C18.8529 15.2769 19.2383 14.517 18.8379 13.9711Z" fill="white" />
			</svg>
			<span class="app-sidebar-brand-text">Zapstore</span>
		</a>

		<!-- Search bar -->
		<div class="app-sidebar-search">
			<button
				type="button"
				class="sidebar-search-btn"
				onclick={() => onOpenSearch?.()}
				aria-label="Search any app"
			>
				<Search size={16} strokeWidth={1.5} class="sidebar-search-icon" />
				<span class="sidebar-search-placeholder">Search Any App</span>
			</button>
		</div>

		<nav class="app-sidebar-nav">
			<!-- Browse (no section title) -->
			<div class="app-sidebar-section">
				<ul class="app-sidebar-list">
					<li>
						<a href="/apps" class="app-sidebar-link" class:active={isActive('/apps')}>Apps</a>
					</li>
					<li>
						<a href="/apps" class="app-sidebar-link" class:active={isActive('/apps')}>Apps</a>
					</li>
					<li>
						<a href="/stacks" class="app-sidebar-link" class:active={isActive('/stacks')}>Stacks</a>
					</li>
				</ul>
			</div>

			<!-- Our Community -->
			<div class="app-sidebar-section">
				<h2 class="app-sidebar-section-title">Our Community</h2>
				<ul class="app-sidebar-list">
					<li>
						<a href="/community" class="app-sidebar-link" class:active={isActive('/community')}>Community</a>
					</li>
					<li>
						<a href="/blog" class="app-sidebar-link" class:active={isActive('/blog')}>Blog</a>
					</li>
					<li>
						<a href={SIGNAL_USER_SUPPORT_GROUP_URL} class="app-sidebar-link" target="_blank" rel="noopener noreferrer">User support</a>
					</li>
					<li>
						<a href={SIGNAL_DEV_SUPPORT_GROUP_URL} class="app-sidebar-link" target="_blank" rel="noopener noreferrer">Dev support</a>
					</li>
				</ul>
			</div>

			<!-- For Developers -->
			<div class="app-sidebar-section">
				<h2 class="app-sidebar-section-title">For Developers</h2>
				<ul class="app-sidebar-list">
					<li>
						<a href="/studio" class="app-sidebar-link" class:active={isActive('/studio')}>Studio</a>
					</li>
				</ul>
			</div>
		</nav>

		<!-- User section at bottom -->
		<div class="app-sidebar-footer">
			{#if isConnected && profileHref}
				<!-- Signed in: avatar + name row with sign-out dropdown -->
				<div class="sidebar-user" class:open={profileDropdownOpen}>
					{#if profileDropdownOpen}
						<div class="sidebar-user-dropdown">
							<a
								href={profileHref}
								class="sidebar-user-dropdown-item"
								onclick={() => (profileDropdownOpen = false)}
							>
								<User size={15} />
								<span>View profile</span>
							</a>
							<div class="sidebar-user-dropdown-divider"></div>
							<button type="button" class="sidebar-user-dropdown-item" onclick={handleSignOut}>
								<LogOut size={15} />
								<span>Disconnect</span>
							</button>
						</div>
					{/if}
					<button
						type="button"
						class="sidebar-user-btn"
						onclick={toggleProfileDropdown}
						aria-label="Account menu"
						aria-expanded={profileDropdownOpen}
					>
					<ProfilePic
						{pubkey}
						pictureUrl={userProfile?.picture || undefined}
						name={userProfile?.name || undefined}
						size="md"
					/>
						<span class="sidebar-user-name">
							{userProfile?.name || 'My profile'}
						</span>
					</button>
				</div>
			{:else}
				<!-- Not signed in: Sign in CTA -->
				<button type="button" class="btn-primary w-full" onclick={() => onGetStarted?.()}>
					Sign in
				</button>
			{/if}
		</div>
	</div>
</aside>

<style>
	.app-sidebar {
		display: none;
		width: 260px;
		min-width: 260px;
		height: 100%;
		position: relative;
		flex-shrink: 0;
		border-right: 1px solid hsl(var(--white16));
		flex-direction: column;
		/* Match the subtle gradient tint of the right page */
		background: radial-gradient(ellipse 160% 40% at 50% -10%, hsl(var(--primary) / 0.06), transparent),
		            hsl(var(--background));
	}

	@media (min-width: 768px) {
		.app-sidebar {
			display: flex;
		}
	}

	.app-sidebar-inner {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: 17px 20px 23px;
	}

	.app-sidebar-brand {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 0 18px 10px;
		text-decoration: none;
		color: inherit;
	}

	/* Search bar — matches chateau left-column search style */
	.app-sidebar-search {
		padding: 0 0 12px;
		margin-bottom: 8px;
	}

	.sidebar-search-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		height: 32px;
		padding: 0 10px;
		border: 0.33px solid hsl(var(--white16));
		border-radius: 10px;
		background: transparent;
		cursor: pointer;
		text-align: left;
		color: hsl(var(--foreground));
		transition: background-color 0.15s ease, border-color 0.15s ease;
	}

	.sidebar-search-btn:hover {
		background-color: hsl(var(--white4));
		border-color: hsl(var(--white33));
	}

	.sidebar-search-placeholder {
		font-size: 0.8125rem;
		color: hsl(var(--white33));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.sidebar-search-icon) {
		flex-shrink: 0;
		color: hsl(var(--white33));
	}

	.app-sidebar-brand:hover {
		color: hsl(var(--blurpleLightColor));
	}

	.app-sidebar-logo {
		height: 28px;
		width: auto;
		flex-shrink: 0;
	}

	.app-sidebar-brand-text {
		font-size: 1.125rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		color: hsl(var(--foreground));
	}

	.app-sidebar-nav {
		flex: 1;
		overflow-y: auto;
		padding: 0;
	}

	.app-sidebar-section {
		margin-bottom: 20px;
	}

	.app-sidebar-section:last-child {
		margin-bottom: 0;
	}

	/* Matches ActionsModal section header style */
	.app-sidebar-section-title {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: hsl(var(--white33));
		padding: 0 0 4px 14px;
		margin: 0;
	}

	.app-sidebar-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.app-sidebar-list li {
		margin: 0;
	}

	.app-sidebar-link {
		display: block;
		padding: 8px 14px;
		font-size: 0.9375rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		text-decoration: none;
		border-radius: 10px;
		transition: color 0.15s ease, background-color 0.15s ease;
	}

	.app-sidebar-link:hover {
		color: hsl(var(--foreground));
		background-color: hsl(var(--white4));
	}

	.app-sidebar-link.active {
		color: hsl(var(--white));
		background-color: hsl(var(--white8));
	}

	.app-sidebar-footer {
		padding: 16px 0 0;
		margin-top: auto;
	}


	/* ── User profile row ──────────────────────────────────────────────── */
	.sidebar-user {
		position: relative;
	}

	.sidebar-user-btn {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		padding: 8px 8px;
		background: none;
		border: none;
		border-radius: 10px;
		cursor: pointer;
		text-align: left;
		color: hsl(var(--foreground));
		transition: background-color 0.15s ease;
	}

	.sidebar-user-btn:hover,
	.sidebar-user.open .sidebar-user-btn {
		background-color: hsl(var(--accent) / 0.08);
	}

	.sidebar-user-name {
		flex: 1;
		font-size: 0.875rem;
		font-weight: 500;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: hsl(var(--white66));
	}

	.sidebar-user-dropdown {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 0;
		right: 0;
		background: hsla(240, 6%, 18%, 0.92);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 0.33px solid hsl(var(--white16));
		border-radius: 12px;
		padding: 4px;
		box-shadow: 0 4px 24px hsl(var(--black66) / 0.5);
		z-index: 60;
	}

	.sidebar-user-dropdown-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px 10px;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		background: none;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		text-decoration: none;
		font-family: inherit;
		transition: background-color 0.15s ease;
	}

	.sidebar-user-dropdown-item:hover {
		background-color: hsl(var(--accent) / 0.1);
	}

	.sidebar-user-dropdown-divider {
		height: 0.33px;
		background-color: hsl(var(--white16));
		margin: 4px 0;
	}
</style>
