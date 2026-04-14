<script lang="js">
/**
 * MobileBottomNav - Primary navigation for mobile screens.
 * Replaces the duplicate mobile Header on sidebar pages.
 * Only rendered on screens narrower than the md breakpoint (768px).
 *
 * 4 tabs: Apps | Stacks | Apps | Profile (or Get Started)
 */
import { page } from '$app/stores';
import { Package, Layers, Compass, User } from 'lucide-svelte';
import { getCurrentPubkey } from '$lib/stores/auth.svelte.js';
import { nip19 } from 'nostr-tools';
import ProfilePic from '$lib/components/common/ProfilePic.svelte';

let { onGetStarted } = $props();

const path = $derived($page.url.pathname);
const pubkey = $derived(getCurrentPubkey());
const isConnected = $derived(pubkey !== null);
const profileHref = $derived(pubkey ? '/profile/' + nip19.npubEncode(pubkey) : null);

function isActive(href) {
	if (href === '/apps') return path === '/apps' || path.startsWith('/apps/');
	if (href === '/stacks') return path === '/stacks' || path.startsWith('/stacks/');
	if (href === '/apps') return path === '/apps';
	if (href.startsWith('/profile/')) return path.startsWith('/profile/');
	return path === href;
}
</script>

<nav class="mobile-bottom-nav" aria-label="Main navigation">
	<a href="/apps" class="nav-item" class:active={isActive('/apps')} aria-label="Apps">
		<Package size={22} class="nav-icon" />
		<span class="nav-label">Apps</span>
	</a>

	<a href="/stacks" class="nav-item" class:active={isActive('/stacks')} aria-label="Stacks">
		<Layers size={22} class="nav-icon" />
		<span class="nav-label">Stacks</span>
	</a>

	<a href="/apps" class="nav-item" class:active={isActive('/apps')} aria-label="Apps">
		<Compass size={22} class="nav-icon" />
		<span class="nav-label">Apps</span>
	</a>

	{#if isConnected && profileHref}
		<a
			href={profileHref}
			class="nav-item"
			class:active={isActive('/profile/')}
			aria-label="My profile"
		>
			<div class="nav-profile-pic">
				<ProfilePic {pubkey} size="sm" />
			</div>
			<span class="nav-label">Profile</span>
		</a>
	{:else}
		<button
			type="button"
			class="nav-item"
			onclick={() => onGetStarted?.()}
			aria-label="Sign in"
		>
			<User size={22} class="nav-icon" />
			<span class="nav-label">Sign in</span>
		</button>
	{/if}
</nav>

<style>
	.mobile-bottom-nav {
		display: none;
		flex-direction: row;
		height: 56px;
		flex-shrink: 0;
		background-color: hsl(var(--black) / 0.92);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-top: 1px solid hsl(var(--border) / 0.5);
		padding: 0 4px;
		/* Account for iOS home indicator */
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}

	@media (max-width: 767px) {
		.mobile-bottom-nav {
			display: flex;
		}
	}

	.nav-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		gap: 3px;
		padding: 6px 4px;
		text-decoration: none;
		color: hsl(var(--white66));
		border: none;
		background: none;
		cursor: pointer;
		border-radius: 10px;
		font-family: inherit;
		transition:
			color 0.15s ease,
			background-color 0.15s ease;
		-webkit-tap-highlight-color: transparent;
	}

	.nav-item:hover {
		color: hsl(var(--white));
		background-color: hsl(var(--accent) / 0.06);
	}

	.nav-item.active {
		color: hsl(var(--blurpleLightColor));
		background-color: hsl(var(--accent) / 0.1);
	}

	.nav-label {
		font-size: 0.625rem;
		font-weight: 500;
		line-height: 1;
		letter-spacing: 0.02em;
	}

	.nav-profile-pic {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		overflow: hidden;
		flex-shrink: 0;
	}

	/* Ensure lucide icons don't inherit unexpected styles */
	:global(.nav-icon) {
		flex-shrink: 0;
		display: block;
	}
</style>
