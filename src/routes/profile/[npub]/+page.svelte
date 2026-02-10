<script lang="ts">
	/**
	 * Profile page - header (pic, name, npub, Add button) + Published Apps & Stacks
	 */
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import {
		fetchEvents,
		fetchProfile,
		fetchAppStacksParsed,
		parseApp,
		initNostrService,
		encodeAppNaddr,
		encodeStackNaddr
	} from '$lib/nostr';
	import { nip19 } from 'nostr-tools';
	import { EVENT_KINDS, DEFAULT_CATALOG_RELAYS, PLATFORM_FILTER } from '$lib/config';
	import { wheelScroll } from '$lib/actions/wheelScroll.js';
	import { parseShortText } from '$lib/utils/short-text-parser.js';
	import { resolveStackApps } from '$lib/stores/stacks.svelte';
	import { getCurrentPubkey } from '$lib/stores/auth.svelte';
	import type { App, AppStack } from '$lib/nostr';
	import type { PageData } from './$types';
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
	import NpubDisplay from '$lib/components/common/NpubDisplay.svelte';
	import AppSmallCard from '$lib/components/cards/AppSmallCard.svelte';
	import AppStackCard from '$lib/components/cards/AppStackCard.svelte';
	import SectionHeader from '$lib/components/cards/SectionHeader.svelte';
	import ShortTextRenderer from '$lib/components/common/ShortTextRenderer.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import { Plus, Copy, Check } from '$lib/components/icons';

	let { data }: { data: PageData } = $props();

	const npub = $derived(data.npub ?? '');
	const pubkey = $derived(data.pubkey);

	let profile = $state<{
		name?: string;
		displayName?: string;
		picture?: string;
		about?: string;
	} | null>(null);
	let profileLoading = $state(true);
	let apps = $state<App[]>([]);
	let appsLoading = $state(true);
	let stacks = $state<AppStack[]>([]);
	let stacksLoading = $state(true);
	let addButtonLabel = $state<'Add' | 'Added'>('Add');
	let addButtonDisabled = $state(false);
	/** Resolved display names for npubs mentioned in profile about (nostr:npub1...) */
	let mentionProfiles = $state<Record<string, string>>({});
	/** Stacks with resolved app details (icons, names) for display */
	let resolvedStacks = $state<Array<{ stack: AppStack; apps: App[] }>>([]);

	const profileName = $derived(
		profile?.displayName || profile?.name || (pubkey ? `${pubkey.slice(0, 8)}…` : 'Anonymous')
	);
	const profilePictureUrl = $derived(profile?.picture ?? '');
	const isConnected = $derived(getCurrentPubkey() !== null);

	async function loadProfile(pk: string) {
		profileLoading = true;
		try {
			if (browser) await initNostrService();
			const event = await fetchProfile(pk);
			if (event?.content) {
				const c = JSON.parse(event.content) as Record<string, unknown>;
				profile = {
					name: c.name as string | undefined,
					displayName: (c.display_name as string) || (c.name as string),
					picture: c.picture as string | undefined,
					about: c.about as string | undefined
				};
			} else {
				profile = {};
			}
		} catch {
			profile = {};
		} finally {
			profileLoading = false;
		}
	}

	async function loadAppsByAuthor(pk: string) {
		appsLoading = true;
		try {
			if (browser) await initNostrService();
			const events = await fetchEvents(
				{ kinds: [EVENT_KINDS.APP], authors: [pk], ...PLATFORM_FILTER, limit: 50 },
				{ relays: [...DEFAULT_CATALOG_RELAYS], timeout: 8000 }
			);
			apps = events.map((ev) => parseApp(ev));
		} catch {
			apps = [];
		} finally {
			appsLoading = false;
		}
	}

	async function loadStacksByAuthor(pk: string) {
		stacksLoading = true;
		try {
			if (browser) await initNostrService();
			const list = await fetchAppStacksParsed({
				authors: [pk],
				limit: 50,
				timeout: 8000
			});
			stacks = list;
			// Resolve app details (icons, names) for each stack
			const resolved: Array<{ stack: AppStack; apps: App[] }> = [];
			for (const stack of list) {
				try {
					const apps = await resolveStackApps(stack);
					resolved.push({ stack, apps });
				} catch {
					resolved.push({ stack, apps: [] });
				}
			}
			resolvedStacks = resolved;
		} catch {
			stacks = [];
			resolvedStacks = [];
		} finally {
			stacksLoading = false;
		}
	}

	/** Load profiles for pubkeys mentioned in about (nostr:npub...) for resolveMentionLabel */
	async function loadMentionProfiles(about: string) {
		const segments = parseShortText({ text: about, emojiTags: [] });
		const pubkeys = [
			...new Set(
				segments
					.filter(
						(
							s
						): s is Extract<
							import('$lib/utils/short-text-parser.js').ShortTextSegment,
							{ type: 'mention' }
						> => s.type === 'mention'
					)
					.map((s) => s.pubkey)
			)
		];
		const next: Record<string, string> = {};
		for (const pk of pubkeys) {
			try {
				const event = await fetchProfile(pk);
				if (event?.content) {
					const c = JSON.parse(event.content) as Record<string, unknown>;
					const name = (c.display_name as string) || (c.name as string);
					if (name) next[pk] = name;
				}
			} catch {
				// ignore
			}
		}
		mentionProfiles = { ...mentionProfiles, ...next };
	}

	function handleAddClick() {
		// Placeholder: add/remove from kind 3 and kind 30000 (simplified for first draft)
		addButtonDisabled = true;
		addButtonLabel = 'Added';
		setTimeout(() => {
			addButtonDisabled = false;
		}, 800);
	}

	let npubCopied = $state(false);
	async function copyNpub() {
		if (!npub) return;
		try {
			await navigator.clipboard.writeText(npub);
			npubCopied = true;
			setTimeout(() => (npubCopied = false), 1500);
		} catch {
			// ignore
		}
	}

	onMount(() => {
		if (!pubkey || !browser) return;
		loadProfile(pubkey);
		loadAppsByAuthor(pubkey);
		loadStacksByAuthor(pubkey);
	});

	$effect(() => {
		const about = profile?.about?.trim();
		if (about && browser) loadMentionProfiles(about);
	});

	// Stack card shape for AppStackCard: name, description, apps[] (with icon), creator
	function stackToCard(
		s: AppStack,
		resolvedApps?: App[]
	): {
		name: string;
		description: string;
		apps: Array<{ name: string; icon?: string; dTag?: string }>;
		creator?: { name?: string; picture?: string; pubkey: string; npub: string };
	} {
		const creatorNpub = pubkey ? nip19.npubEncode(pubkey) : '';
		const appRefs = s.appRefs || [];
		const apps =
			resolvedApps && resolvedApps.length > 0
				? resolvedApps.map((a) => ({ name: a.name || a.dTag || '', icon: a.icon, dTag: a.dTag }))
				: appRefs.map((ref) => ({ name: ref.identifier, dTag: ref.identifier }));
		return {
			name: s.title || s.dTag || 'Untitled',
			description: s.description || '',
			apps,
			creator: pubkey
				? {
						name: profileName,
						picture: profilePictureUrl,
						pubkey,
						npub: creatorNpub
					}
				: undefined
		};
	}
</script>

<svelte:head>
	<title>{profileName} - Profile - Zapstore</title>
</svelte:head>

{#if !pubkey}
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
		<div
			class="rounded-lg bg-destructive/10 border border-destructive/20 p-6 max-w-md mx-auto text-center"
		>
			<h3 class="text-lg font-semibold text-destructive mb-2">Invalid profile</h3>
			<p class="text-muted-foreground">The profile address (npub) is not valid.</p>
		</div>
	</div>
{:else}
	<!-- Profile hero: full-width, blurred pic bg at 16% on gray44, border bottom -->
	<section class="profile-hero border-t border-b border-border/50">
		<div class="profile-hero-bg" aria-hidden="true">
			{#if profilePictureUrl}
				<div
					class="profile-hero-bg-image"
					style="background-image: url('{profilePictureUrl}');"
				></div>
			{/if}
			<!-- Left and right shaders (fade blur into bg, like apps/stacks sections) -->
			<div class="profile-hero-shader profile-hero-shader-left"></div>
			<div class="profile-hero-shader profile-hero-shader-right"></div>
		</div>
		<div
			class="profile-hero-content container mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6 md:pt-10 md:pb-8"
		>
			<div class="profile-header flex items-center gap-6 sm:gap-8">
				<div class="profile-pic-column flex flex-col items-center flex-shrink-0">
					<div class="profile-pic-wrap">
						<ProfilePic
							pictureUrl={profilePictureUrl || undefined}
							{pubkey}
							name={profileName}
							size="3xl"
							loading={profileLoading}
						/>
					</div>
					{#if isConnected}
						<button
							type="button"
							class="add-btn install-btn-mobile btn-primary-small flex items-center justify-center gap-2 w-full"
							onclick={handleAddClick}
							disabled={addButtonDisabled}
							aria-label={addButtonLabel}
						>
							<Plus variant="outline" color="white" size={16} strokeWidth={2.5} />
							<span>{addButtonLabel}</span>
						</button>
					{/if}
				</div>

				<div class="profile-info flex-1 min-w-0">
					<div class="profile-name-row flex items-center justify-between gap-3 mb-3">
						<h1
							class="profile-name text-[1.625rem] sm:text-4xl font-black"
							style="color: hsl(var(--white));"
						>
							{profileName}
						</h1>
						{#if isConnected}
							<button
								type="button"
								class="add-btn install-btn-desktop btn-primary flex items-center gap-2 flex-shrink-0"
								onclick={handleAddClick}
								disabled={addButtonDisabled}
								aria-label={addButtonLabel}
							>
								<Plus variant="outline" color="white" size={18} strokeWidth={2.5} />
								<span>{addButtonLabel}</span>
							</button>
						{/if}
					</div>
					{#if profile?.about?.trim()}
						<div class="profile-description text-base mb-3" style="color: hsl(var(--white66));">
							<ShortTextRenderer
								content={profile.about}
								resolveMentionLabel={(pk) => mentionProfiles[pk]}
							/>
						</div>
					{/if}
					<div class="profile-npub-row">
						<NpubDisplay {npub} {pubkey} size="md" truncate={true} />
						<button
							type="button"
							class="profile-npub-copy"
							onclick={copyNpub}
							aria-label="Copy npub"
						>
							{#if npubCopied}
								<span class="profile-npub-copy-check">
									<Check
										variant="outline"
										size={14}
										strokeWidth={2.8}
										color="hsl(var(--blurpleLightColor))"
									/>
								</span>
							{:else}
								<Copy variant="outline" size={16} color="hsl(var(--white66))" />
							{/if}
						</button>
					</div>
				</div>
			</div>
		</div>
	</section>

	<div class="container mx-auto px-4 sm:px-6 lg:px-8 pt-8 md:pt-10 pb-8">
		<!-- Published Apps (one row, horizontal scroll like discover) -->
		<section class="profile-section">
			<SectionHeader title="Apps" />
			{#if appsLoading}
				<div class="horizontal-scroll profile-scroll" use:wheelScroll>
					<div class="scroll-content">
						{#each Array(5) as _}
							<div class="profile-app-item">
								<div class="skeleton-card">
									<div class="skeleton-icon">
										<SkeletonLoader />
									</div>
									<div class="skeleton-info">
										<div class="skeleton-name">
											<SkeletonLoader />
										</div>
										<div class="skeleton-desc-lines">
											<div class="skeleton-desc skeleton-desc-1"></div>
											<div class="skeleton-desc skeleton-desc-2 desktop-only"></div>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else if apps.length === 0}
				<p class="text-sm" style="color: hsl(var(--white33));">No published apps.</p>
			{:else}
				<div class="horizontal-scroll profile-scroll" use:wheelScroll>
					<div class="scroll-content">
						{#each apps as app}
							{@const naddr = app.naddr || encodeAppNaddr(app.pubkey, app.dTag)}
							<div class="profile-app-item">
								<AppSmallCard
									app={{
										name: app.name,
										icon: app.icon,
										description: app.description,
										dTag: app.dTag
									}}
									href="/apps/{naddr}"
								/>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</section>

		<!-- Published Stacks (one row, horizontal scroll like discover) -->
		<section class="profile-section">
			<SectionHeader title="Stacks" />
			{#if stacksLoading}
				<div class="horizontal-scroll profile-scroll" use:wheelScroll>
					<div class="scroll-content">
						{#each Array(4) as _}
							<div class="profile-stack-item">
								<div class="skeleton-stack">
									<div class="skeleton-stack-grid">
										<SkeletonLoader />
									</div>
									<div class="skeleton-stack-info">
										<div class="skeleton-stack-text">
											<div class="skeleton-stack-name"><SkeletonLoader /></div>
											<div class="skeleton-stack-desc-lines">
												<div class="skeleton-stack-desc skeleton-stack-desc-1"></div>
												<div class="skeleton-stack-desc skeleton-stack-desc-2"></div>
											</div>
										</div>
										<div class="skeleton-stack-creator">
											<div class="skeleton-stack-avatar">
												<SkeletonLoader />
											</div>
											<div class="skeleton-stack-creator-name"></div>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else if resolvedStacks.length === 0}
				<p class="text-sm" style="color: hsl(var(--white33));">No published stacks.</p>
			{:else}
				<div class="horizontal-scroll profile-scroll" use:wheelScroll>
					<div class="scroll-content">
						{#each resolvedStacks as { stack, apps: resolvedApps }}
							{@const href = '/stacks/' + encodeStackNaddr(stack.pubkey, stack.dTag)}
							<div class="profile-stack-item">
								<AppStackCard stack={stackToCard(stack, resolvedApps)} {href} />
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</section>
	</div>
{/if}

<style>
	.profile-hero {
		position: relative;
		width: 100%;
		background-color: hsl(var(--gray44));
		overflow: hidden;
	}

	.profile-hero-bg {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	.profile-hero-bg-image {
		position: absolute;
		inset: -20%;
		background-size: cover;
		background-position: center;
		filter: blur(40px);
		opacity: 0.16;
	}

	.profile-hero-shader {
		display: none; /* only show on desktop */
		position: absolute;
		top: 0;
		bottom: 0;
		width: 20%;
		max-width: 160px;
		pointer-events: none;
	}

	.profile-hero-shader-left {
		left: 0;
		background: linear-gradient(to right, hsl(var(--background)) 0%, transparent 100%);
	}

	.profile-hero-shader-right {
		right: 0;
		background: linear-gradient(to left, hsl(var(--background)) 0%, transparent 100%);
	}

	/* Desktop only: show shaders and extend to container gutter + padding */
	@media (min-width: 1024px) {
		.profile-hero-shader {
			display: block;
			width: max(2rem, calc((100vw - 1100px) / 2 + 2rem));
			max-width: none;
		}
	}

	.profile-hero-content {
		position: relative;
		z-index: 1;
	}

	.profile-header {
		align-items: flex-start;
	}

	.profile-pic-column {
		gap: 12px;
	}

	/* Mobile: scale down profile section and show Add under pic */
	@media (max-width: 767px) {
		.profile-hero-content {
			font-size: 0.94em;
		}
		.profile-pic-wrap {
			transform: scale(0.75);
			transform-origin: top center;
		}
		.profile-name {
			font-size: 1.5rem !important;
		}
	}

	@media (min-width: 768px) {
		.profile-header {
			align-items: center;
		}
		.profile-pic-column .install-btn-mobile {
			display: none !important;
		}
	}

	.profile-name {
		word-break: break-word;
	}

	.profile-npub-row {
		margin-top: 12px;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.profile-npub-copy {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		margin: 0;
		border: none;
		background: none;
		cursor: pointer;
		color: hsl(var(--white66));
		transition: color 0.15s ease;
	}

	.profile-npub-copy:hover {
		color: hsl(var(--white));
	}

	.profile-npub-copy .profile-npub-copy-check {
		display: flex;
		animation: popIn 0.3s ease-out;
	}

	@keyframes popIn {
		0% {
			transform: scale(0);
		}
		50% {
			transform: scale(1.2);
		}
		100% {
			transform: scale(1);
		}
	}

	.add-btn:disabled {
		opacity: 0.7;
		cursor: default;
	}

	.add-btn.install-btn-mobile {
		display: inline-flex;
	}

	.add-btn.install-btn-desktop {
		display: none;
	}

	@media (min-width: 768px) {
		.add-btn.install-btn-desktop {
			display: inline-flex;
		}
	}

	.profile-section {
		margin-bottom: 24px;
	}

	/* App skeleton (match discover) */
	.skeleton-card {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		padding: 4px 0;
	}

	.skeleton-icon {
		width: 56px;
		height: 56px;
		border-radius: 16px;
		overflow: hidden;
		flex-shrink: 0;
	}

	@media (min-width: 768px) {
		.skeleton-card {
			gap: 20px;
		}
		.skeleton-icon {
			width: 72px;
			height: 72px;
			border-radius: 24px;
		}
		.skeleton-name {
			width: 140px;
			height: 20px;
		}
		.skeleton-desc {
			height: 12px;
		}
		.skeleton-desc-1 {
			width: 220px;
		}
		.skeleton-desc-2 {
			width: 160px;
		}
	}

	.skeleton-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 6px;
	}

	.skeleton-name {
		width: 100px;
		height: 18px;
		border-radius: 12px;
		overflow: hidden;
	}

	.skeleton-desc-lines {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.skeleton-desc {
		height: 10px;
		border-radius: 12px;
		background: hsl(var(--gray33));
	}

	.skeleton-desc-1 {
		width: 180px;
	}

	.skeleton-desc-2 {
		width: 120px;
	}

	.skeleton-desc-2.desktop-only {
		display: none;
	}

	@media (min-width: 768px) {
		.skeleton-desc-2.desktop-only {
			display: block;
		}
	}

	/* Stack skeleton (match discover) */
	.skeleton-stack {
		display: flex;
		align-items: stretch;
		gap: 16px;
		padding: 8px 0;
		width: 100%;
	}

	.skeleton-stack-grid {
		width: 86px;
		height: 86px;
		border-radius: 16px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.skeleton-stack-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 4px 0;
	}

	.skeleton-stack-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.skeleton-stack-name {
		width: 100px;
		height: 18px;
		border-radius: 12px;
		overflow: hidden;
	}

	.skeleton-stack-desc-lines {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.skeleton-stack-desc {
		height: 10px;
		border-radius: 12px;
		background-color: hsl(var(--gray33));
	}

	.skeleton-stack-desc-1 {
		width: 160px;
	}

	.skeleton-stack-desc-2 {
		width: 100px;
	}

	.skeleton-stack-creator {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.skeleton-stack-avatar {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		overflow: hidden;
		flex-shrink: 0;
	}

	.skeleton-stack-creator-name {
		width: 60px;
		height: 12px;
		border-radius: 12px;
		background-color: hsl(var(--gray33));
	}

	@media (min-width: 768px) {
		.skeleton-stack {
			gap: 20px;
		}
		.skeleton-stack-grid {
			width: 104px;
			height: 104px;
			border-radius: 20px;
		}
		.skeleton-stack-name {
			width: 130px;
			height: 20px;
		}
		.skeleton-stack-desc {
			height: 12px;
		}
		.skeleton-stack-desc-1 {
			width: 200px;
		}
		.skeleton-stack-desc-2 {
			width: 140px;
		}
		.skeleton-stack-avatar {
			width: 24px;
			height: 24px;
		}
		.skeleton-stack-creator-name {
			width: 80px;
			height: 14px;
		}
	}

	.horizontal-scroll.profile-scroll {
		margin-left: -1rem;
		margin-right: -1rem;
		padding-left: 1rem;
		padding-right: 1rem;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		-ms-overflow-style: none;
		mask-image: linear-gradient(
			to right,
			transparent 0%,
			black 1rem,
			black calc(100% - 1rem),
			transparent 100%
		);
		-webkit-mask-image: linear-gradient(
			to right,
			transparent 0%,
			black 1rem,
			black calc(100% - 1rem),
			transparent 100%
		);
	}

	.horizontal-scroll.profile-scroll::-webkit-scrollbar {
		display: none;
	}

	.profile-scroll .scroll-content {
		display: flex;
		gap: 16px;
		padding-bottom: 8px;
	}

	.profile-app-item {
		flex-shrink: 0;
		width: 280px;
	}

	@media (min-width: 768px) {
		.profile-app-item {
			width: 320px;
		}
	}

	.profile-stack-item {
		flex-shrink: 0;
		width: 280px;
	}

	@media (min-width: 768px) {
		.profile-stack-item {
			width: 320px;
		}
	}

	@media (min-width: 640px) {
		.horizontal-scroll.profile-scroll {
			margin-left: -1.5rem;
			margin-right: -1.5rem;
			padding-left: 1.5rem;
			padding-right: 1.5rem;
			mask-image: linear-gradient(
				to right,
				transparent 0%,
				black 1.5rem,
				black calc(100% - 1.5rem),
				transparent 100%
			);
			-webkit-mask-image: linear-gradient(
				to right,
				transparent 0%,
				black 1.5rem,
				black calc(100% - 1.5rem),
				transparent 100%
			);
		}
	}

	@media (min-width: 1024px) {
		.horizontal-scroll.profile-scroll {
			margin-left: -2rem;
			margin-right: -2rem;
			padding-left: 2rem;
			padding-right: 2rem;
			mask-image: linear-gradient(
				to right,
				transparent 0%,
				black 2rem,
				black calc(100% - 2rem),
				transparent 100%
			);
			-webkit-mask-image: linear-gradient(
				to right,
				transparent 0%,
				black 2rem,
				black calc(100% - 2rem),
				transparent 100%
			);
		}
	}
</style>
