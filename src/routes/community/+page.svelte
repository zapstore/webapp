<script lang="js">
// @ts-nocheck
/**
 * Community Page — /community
 *
 * Matches Studio layout: container mx-auto px-0 sm:px-6 lg:px-8, dashboard with
 * sidebar (260px) + content. Forum feed uses ForumPostCard + EmptyState, with
 * CommunityBottomBar at bottom for + Post and Search Forum.
 *
 * All posts and comments fetched from ZAPSTORE_COMMUNITY_RELAY (enforced).
 */
import { browser } from '$app/environment';
import { nip19 } from 'nostr-tools';
import { fetchFromRelays, fetchProfilesBatch, putEvents, publishToRelays, parseForumPost } from '$lib/nostr';
import { parseProfile } from '$lib/nostr/models';
import {
	EVENT_KINDS,
	ZAPSTORE_COMMUNITY_RELAY,
	ZAPSTORE_COMMUNITY_NPUB
} from '$lib/config';
import { getIsSignedIn, getCurrentPubkey, signEvent } from '$lib/stores/auth.svelte.js';
import ForumPostCard from '$lib/components/ForumPostCard.svelte';
import ProfilePic from '$lib/components/common/ProfilePic.svelte';
import EmptyState from '$lib/components/common/EmptyState.svelte';
import CommunityBottomBar from '$lib/components/community/CommunityBottomBar.svelte';
import ForumPostModal from '$lib/components/modals/ForumPostModal.svelte';
import Spinner from '$lib/components/common/Spinner.svelte';
import { ChevronDown } from '$lib/components/icons';

const COMMUNITY_PUBKEY = (() => {
	try {
		const d = nip19.decode(ZAPSTORE_COMMUNITY_NPUB);
		return d.type === 'npub' ? d.data : '';
	} catch {
		return '';
	}
})();

const RELAYS = [ZAPSTORE_COMMUNITY_RELAY];

/** @type {'forum' | 'blog' | 'activity'} */
let activeSection = $state('forum');
let sectionMenuOpen = $state(false);

const SECTIONS = [
	{ id: 'forum', label: 'Forum' },
	{ id: 'blog', label: 'Blog' },
	{ id: 'activity', label: 'Activity' }
];
const activeSectionLabel = $derived(SECTIONS.find((s) => s.id === activeSection)?.label ?? 'Forum');

// Forum feed
let posts = $state(/** @type {any[]} */ ([]));
let postsLoading = $state(false);
let postsError = $state('');
let feedProfiles = $state(/** @type {Map<string,any>} */ (new Map()));
/** @type {Map<string, { profiles: any[], count: number }>} */
let commentersByPostId = $state(new Map());

// Detail
let selectedPost = $state(/** @type {any|null} */ (null));
let comments = $state(/** @type {any[]} */ ([]));
let commentsLoading = $state(false);
let detailProfiles = $state(/** @type {Map<string,any>} */ (new Map()));

// Modals
let addPostModalOpen = $state(false);
let zapOpen = $state(false);
let zapAmount = $state(21);
let zapComment = $state('');
let zapLoading = $state(false);
let zapError = $state('');
let zapInvoice = $state('');
let zapCopied = $state(false);

// Bottom bar
let commentExpanded = $state(false);
let commentText = $state('');
let commentSubmitting = $state(false);
let commentError = $state('');

const ZAP_PRESETS = [21, 100, 500, 1000, 5000];
const isSignedIn = $derived(getIsSignedIn());
const barOut = $derived(zapOpen || addPostModalOpen);

function profileOf(pubkey, ...maps) {
	for (const m of maps) {
		const v = m.get(pubkey);
		if (v) return v;
	}
	return null;
}

function displayName(profile) {
	return profile?.displayName ?? profile?.name ?? 'Anonymous';
}

function timeAgo(ts) {
	const d = Math.floor(Date.now() / 1000) - ts;
	if (d < 60) return 'now';
	if (d < 3600) return `${Math.floor(d / 60)}m ago`;
	if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
	if (d < 86400 * 7) return `${Math.floor(d / 86400)}d ago`;
	return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function loadForum() {
	if (!COMMUNITY_PUBKEY || !browser) return;
	postsLoading = true;
	postsError = '';
	try {
		const evs = await fetchFromRelays(
			RELAYS,
			{ kinds: [EVENT_KINDS.FORUM_POST], '#h': [COMMUNITY_PUBKEY], limit: 50 },
			{ timeout: 7000 }
		);
		posts = evs.map((e) => {
			const p = parseForumPost(e);
			return p ? { ...p, _raw: e } : null;
		}).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);

		const pks = [...new Set(evs.map((e) => e.pubkey))];
		if (pks.length) {
			const pEvs = await fetchProfilesBatch(pks, { timeout: 4000 });
			const m = new Map();
			for (const e of pEvs) {
				try { m.set(e.pubkey, { ...parseProfile(e), content: e.content }); } catch { /* skip */ }
			}
			feedProfiles = m;
		}

		// Load commenters for each post
		const postIds = posts.map((p) => p.id);
		if (postIds.length) {
			const commentEvs = await fetchFromRelays(
				RELAYS,
				{ kinds: [EVENT_KINDS.COMMENT], '#E': postIds, limit: 500 },
				{ timeout: 6000 }
			);
			const byPost = new Map();
			for (const c of commentEvs) {
				const rootE = c.tags?.find((t) => t[0] === 'E')?.[1];
				if (!rootE) continue;
				if (!byPost.has(rootE)) byPost.set(rootE, { profiles: [], count: 0 });
				const entry = byPost.get(rootE);
				entry.count += 1;
				const pk = c.pubkey;
				if (!entry.profiles.some((p) => p.pubkey === pk)) {
					entry.profiles.push({ pubkey: pk, displayName: '', avatarUrl: '' });
				}
			}
			// Enrich with profile data
			const allCommenterPks = [...new Set(commentEvs.map((e) => e.pubkey))];
			const commenterProfiles = allCommenterPks.length
				? await fetchProfilesBatch(allCommenterPks, { timeout: 3000 })
				: [];
			const profileMap = new Map();
			for (const e of commenterProfiles) {
				try {
					const p = parseProfile(e);
					profileMap.set(e.pubkey, p);
				} catch { /* skip */ }
			}
			for (const entry of byPost.values()) {
				entry.profiles = entry.profiles.map((r) => {
					const p = profileMap.get(r.pubkey);
					return {
						pubkey: r.pubkey,
						displayName: p?.displayName ?? p?.name ?? '',
						avatarUrl: p?.picture ?? ''
					};
				});
			}
			commentersByPostId = byPost;
		}
	} catch (err) {
		console.error('[Community/Forum] fetch failed', err);
		postsError = 'Failed to load posts. Check your connection.';
	} finally {
		postsLoading = false;
	}
}

async function loadComments(postId) {
	commentsLoading = true;
	try {
		const evs = await fetchFromRelays(
			RELAYS,
			{ kinds: [EVENT_KINDS.COMMENT], '#E': [postId], limit: 200 },
			{ timeout: 6000 }
		);
		comments = evs.sort((a, b) => a.created_at - b.created_at);

		const pks = [...new Set(evs.map((e) => e.pubkey))];
		if (pks.length) {
			const pEvs = await fetchProfilesBatch(pks, { timeout: 3000 });
			const m = new Map(detailProfiles);
			for (const e of pEvs) {
				try { m.set(e.pubkey, parseProfile(e)); } catch { /* skip */ }
			}
			detailProfiles = m;
		}
	} catch (err) {
		console.error('[Community/Forum] comments fetch failed', err);
	} finally {
		commentsLoading = false;
	}
}

function setSection(s) {
	activeSection = s;
	selectedPost = null;
}

function openPost(post) {
	selectedPost = post;
	comments = [];
	commentExpanded = false;
	zapOpen = false;
	zapInvoice = '';
	const p = feedProfiles.get(post.pubkey);
	detailProfiles = p ? new Map([[post.pubkey, p]]) : new Map();
	loadComments(post.id);
}

function clearDetail() {
	comments = [];
	commentExpanded = false;
	commentText = '';
	commentError = '';
	zapOpen = false;
	zapInvoice = '';
	zapError = '';
}

async function handleForumPostSubmit({ title, text, labels = [] }) {
	if (!isSignedIn) throw new Error('Sign in to post');
	const ev = await signEvent({
		kind: EVENT_KINDS.FORUM_POST,
		content: text,
		tags: [
			['h', COMMUNITY_PUBKEY],
			['title', title],
			...labels.map((l) => ['t', l])
		],
		created_at: Math.floor(Date.now() / 1000)
	});
	await putEvents([ev]);
	await publishToRelays(RELAYS, ev);
	// Refresh feed
	posts = [];
	loadForum();
}

async function submitComment() {
	if (!commentText.trim() || commentSubmitting || !selectedPost) return;
	commentSubmitting = true;
	commentError = '';
	try {
		const { publishComment } = await import('$lib/nostr');
		await publishComment(
			commentText.trim(),
			{ id: selectedPost.id, pubkey: selectedPost.pubkey, kind: 11 },
			signEvent,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			RELAYS
		);
		comments = [];
		loadComments(selectedPost.id);
		commentText = '';
		commentExpanded = false;
	} catch (err) {
		commentError = err?.message ?? 'Failed to post comment';
	} finally {
		commentSubmitting = false;
	}
}

async function confirmZap() {
	if (zapLoading || !selectedPost) return;
	zapLoading = true;
	zapError = '';
	zapInvoice = '';
	try {
		const { createZap } = await import('$lib/nostr/zap');
		const r = await createZap(
			{ pubkey: selectedPost.pubkey, id: selectedPost.id, kind: 11 },
			zapAmount,
			zapComment,
			signEvent
		);
		zapInvoice = r.invoice;
	} catch (err) {
		zapError = err?.message ?? 'Failed to create zap';
	} finally {
		zapLoading = false;
	}
}

async function copyInvoice() {
	try {
		await navigator.clipboard.writeText(zapInvoice);
		zapCopied = true;
		setTimeout(() => (zapCopied = false), 2000);
	} catch { /* fallback */ }
}

function onKeydown(e) {
	if (e.key === 'Escape') {
		if (sectionMenuOpen) { sectionMenuOpen = false; e.preventDefault(); return; }
		if (zapOpen) { zapOpen = false; zapInvoice = ''; zapError = ''; e.preventDefault(); return; }
		if (addPostModalOpen) { addPostModalOpen = false; e.preventDefault(); return; }
		if (commentExpanded) { commentExpanded = false; e.preventDefault(); return; }
		if (selectedPost) { selectedPost = null; clearDetail(); e.preventDefault(); }
	}
}

$effect(() => {
	if (browser && activeSection === 'forum' && posts.length === 0 && !postsLoading && !postsError) {
		loadForum();
	}
});
</script>

<svelte:head>
	<title>Community — Zapstore</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<div class="dashboard-outer container mx-auto px-0 sm:px-6 lg:px-8">
	<div class="dashboard">
		<!-- Section switcher — Studio-style collapsible top box (mobile only) -->
		<div class="section-switcher">
			{#if sectionMenuOpen}
				<div class="section-switcher-panel">
					<button type="button" class="section-switcher-zone" onclick={() => { sectionMenuOpen = false; }}>
						<span class="section-switcher-label">{activeSectionLabel}</span>
						<span class="section-chevron open">
							<ChevronDown variant="outline" color="hsl(var(--white33))" size={14} strokeWidth={1.4} />
						</span>
					</button>
					<div class="section-switcher-content">
						{#each SECTIONS as section}
						<button
							type="button"
							class="section-item"
							class:active={activeSection === section.id}
							onclick={() => { setSection(section.id); sectionMenuOpen = false; }}
						>
							{section.label}
						</button>
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
				<button
					type="button"
					class="nav-item"
					class:active={activeSection === section.id}
					onclick={() => setSection(section.id)}
				>
					<span class="icon-wrap">
						{#if section.id === 'forum'}
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
								<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
							</svg>
						{:else if section.id === 'blog'}
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
								<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
								<polyline points="14 2 14 8 20 8" />
								<line x1="16" y1="13" x2="8" y2="13" />
								<line x1="16" y1="17" x2="8" y2="17" />
								<polyline points="10 9 9 9 8 9" />
							</svg>
						{:else}
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
								<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
							</svg>
						{/if}
					</span>
					<span class="nav-label">{section.label}</span>
				</button>
				{/each}
			</nav>
		</aside>

		<!-- Content — right-page-viewport scopes modals/bars to this column -->
		<div class="content right-page-viewport">

			{#if activeSection === 'forum'}
				{#if selectedPost}
					{@const author = profileOf(selectedPost.pubkey, detailProfiles, feedProfiles)}
					<div class="panel-content panel-content-detail">
						<div class="detail-scroll">
							<div class="detail-back-row">
								<button type="button" class="back-btn" onclick={() => { selectedPost = null; clearDetail(); }}>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M19 12H5M5 12l7 7M5 12l7-7" />
									</svg>
									Forum
								</button>
							</div>
							<div class="detail-post-header">
								<ProfilePic
									pubkey={selectedPost.pubkey}
									pictureUrl={author?.picture}
									name={displayName(author)}
									size="sm"
								/>
								<div class="detail-meta">
									<span class="detail-author-name">{displayName(author)}</span>
									<time class="detail-time">{timeAgo(selectedPost.createdAt)}</time>
								</div>
							</div>
							<h1 class="detail-title">{selectedPost.title}</h1>
							{#if selectedPost.labels?.length}
								<div class="detail-labels">
									{#each selectedPost.labels as label}
										<span class="detail-label">{label}</span>
									{/each}
								</div>
							{/if}
							<div class="detail-content">{selectedPost.content}</div>
							<div class="comments-section">
								<h2 class="comments-heading">
									{#if commentsLoading}
										Loading replies…
									{:else}
										{comments.length} {comments.length === 1 ? 'reply' : 'replies'}
									{/if}
								</h2>
								{#if comments.length === 0 && !commentsLoading}
									<p class="comments-empty">No replies yet — be the first!</p>
								{/if}
								{#each comments as comment (comment.id)}
									{@const commenter = profileOf(comment.pubkey, detailProfiles, feedProfiles)}
									<div class="comment">
										<ProfilePic pubkey={comment.pubkey} pictureUrl={commenter?.picture} name={displayName(commenter)} size="xs" />
										<div class="comment-body">
											<div class="comment-meta">
												<span class="comment-author">{displayName(commenter)}</span>
												<time class="comment-time">{timeAgo(comment.created_at)}</time>
											</div>
											<p class="comment-content">{comment.content}</p>
										</div>
									</div>
								{/each}
							</div>
							<div class="detail-bottom-spacer"></div>
						</div>

						<!-- BottomBar for detail (Zap + Comment) -->
						<div class="bottom-bar-wrapper" class:bar-out={barOut}>
							{#if commentExpanded && isSignedIn}
								<div class="bottom-bar-comment-form">
									<div class="comment-form-card">
										<textarea
											class="comment-textarea"
											placeholder="Write a reply…"
											rows="3"
											bind:value={commentText}
											onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment(); }}
										></textarea>
										{#if commentError}
											<p class="comment-form-error">{commentError}</p>
										{/if}
										<div class="comment-form-row">
											<button type="button" class="cancel-btn" onclick={() => { commentExpanded = false; commentText = ''; commentError = ''; }}>
												Cancel
											</button>
											<button type="button" class="btn-primary-small" onclick={submitComment} disabled={commentSubmitting || !commentText.trim()}>
												{commentSubmitting ? 'Posting…' : 'Reply'}
											</button>
										</div>
									</div>
								</div>
							{:else}
								<div class="bottom-bar">
									{#if isSignedIn}
										<button type="button" class="btn-primary-large zap-btn" onclick={() => { zapOpen = true; }}>
											<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.5 13.5H11L10 22L20.5 10H14L13 2Z" /></svg>
											Zap
										</button>
										<button type="button" class="reply-input-btn" onclick={() => { commentExpanded = true; }}>
											<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
												<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
											</svg>
											<span class="reply-placeholder">Reply…</span>
										</button>
									{:else}
										<div class="guest-bar">
											<span class="guest-bar-text">Sign in to participate</span>
											<a href="/" class="btn-primary-small">Get Started</a>
										</div>
									{/if}
								</div>
							{/if}
						</div>

						<!-- Zap modal -->
						{#if zapOpen}
							<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
							<div class="modal-overlay" onclick={() => { zapOpen = false; zapInvoice = ''; zapError = ''; }} role="presentation"></div>
							<div class="zap-modal" role="dialog" aria-modal="true" aria-label="Zap">
								<div class="zap-modal-header">
									<span class="zap-modal-title">Zap {displayName(author)}</span>
									<button type="button" class="icon-btn" onclick={() => { zapOpen = false; zapInvoice = ''; zapError = ''; }} aria-label="Close">
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
									</button>
								</div>
								{#if zapInvoice}
									<div class="zap-invoice-view">
										<p class="zap-invoice-label">Lightning Invoice</p>
										<code class="zap-invoice-code">{zapInvoice.slice(0, 48)}…</code>
										<button type="button" class="btn-primary-large zap-confirm-btn" onclick={copyInvoice}>
											{zapCopied ? '✓ Copied!' : 'Copy Invoice'}
										</button>
									</div>
								{:else}
									<div class="zap-amounts">
										{#each ZAP_PRESETS as preset}
											<button type="button" class="zap-amount-btn" class:selected={zapAmount === preset} onclick={() => { zapAmount = preset; }}>
												{preset.toLocaleString()}
												<span class="zap-sats-label">sats</span>
											</button>
										{/each}
									</div>
									<div class="zap-field">
										<label class="zap-field-label" for="zap-amount">Custom amount</label>
										<input id="zap-amount" type="number" class="zap-input" min="1" bind:value={zapAmount} placeholder="sats" />
									</div>
									<div class="zap-field">
										<label class="zap-field-label" for="zap-comment">Message (optional)</label>
										<input id="zap-comment" type="text" class="zap-input" bind:value={zapComment} placeholder="Great post!" />
									</div>
									{#if zapError}
										<p class="zap-error">{zapError}</p>
									{/if}
									<button type="button" class="btn-primary-large zap-confirm-btn" onclick={confirmZap} disabled={zapLoading || zapAmount < 1}>
										{#if zapLoading}
											<Spinner size={16} />
											Getting invoice…
										{:else}
											<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.5 13.5H11L10 22L20.5 10H14L13 2Z" /></svg>
											Zap {zapAmount.toLocaleString()} sats
										{/if}
									</button>
								{/if}
							</div>
						{/if}
					</div>
				{:else}
					<!-- Forum feed — no header, just feed + CommunityBottomBar -->
					<div class="panel-content" class:has-bottom-bar={true}>
						<div class="forum-list">
							{#if postsLoading}
								<div class="loading-wrap">
									<Spinner size={24} />
									<span>Loading posts…</span>
								</div>
							{:else if postsError}
								<div class="empty-state-wrap">
									<EmptyState message={postsError} minHeight={400} />
									<button type="button" class="btn-secondary-large" onclick={loadForum}>Retry</button>
								</div>
							{:else if posts.length === 0}
								<div class="empty-state-wrap">
									<EmptyState message="No Forum Posts yet" minHeight={600} />
								</div>
							{:else}
								{#each posts as post (post.id)}
									{@const authorContent = (() => {
										const p = feedProfiles.get(post.pubkey);
										if (!p?.content) return {};
										try { return JSON.parse(p.content); } catch { return {}; }
									})()}
									{@const postCommenters = commentersByPostId.get(post.id)}
									<ForumPostCard
										author={{
											name: authorContent.display_name ?? authorContent.name,
											picture: authorContent.picture,
											npub: (() => { try { return nip19.npubEncode(post.pubkey); } catch { return ''; } })()
										}}
										title={post.title}
										content={post.content}
										timestamp={post.createdAt}
										labels={post.labels ?? []}
										commenters={postCommenters?.profiles ?? []}
										commentCount={postCommenters?.count ?? 0}
										onClick={() => openPost(post)}
									/>
								{/each}
							{/if}
						</div>
					</div>

					{#if !selectedPost}
						<CommunityBottomBar
							showFeedBar={true}
							selectedSection="forum"
							modalOpen={addPostModalOpen}
							onAdd={() => { addPostModalOpen = true; }}
							onSearch={() => { /* TODO */ }}
						/>
					{/if}
				{/if}
			{:else if activeSection === 'blog'}
				<div class="panel-content">
					<div class="section-placeholder">
						<EmptyState message="Blog content — go to /blog for updates." minHeight={280} />
						<a href="/blog" class="btn-primary-large">Go to Blog →</a>
					</div>
				</div>
			{:else}
				<div class="panel-content">
					<div class="section-placeholder">
						<EmptyState message="Activity feed coming soon." minHeight={280} />
					</div>
				</div>
			{/if}

			<!-- ForumPostModal inside right-page-viewport so overlay scopes to content column -->
			<ForumPostModal
				bind:isOpen={addPostModalOpen}
				communityName="Zapstore"
				getCurrentPubkey={getCurrentPubkey}
				onsubmit={handleForumPostSubmit}
				onclose={() => { addPostModalOpen = false; }}
			/>
		</div>
	</div>
</div>

<style>
	.dashboard {
		display: flex;
		min-height: calc(100dvh - 64px);
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

	/* Section switcher — Studio-style collapsible top box (mobile only) */
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
	}

	.section-item:hover:not(.active) {
		background: hsl(var(--white8));
	}

	.section-item.active {
		color: hsl(var(--foreground));
		background: hsl(var(--white8));
	}

	/* Sidebar — desktop only */
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
	}

	.nav-item:hover:not(.active) {
		background: hsl(var(--white8));
	}

	.nav-item.active {
		color: hsl(var(--foreground));
		background: hsl(var(--white8));
	}

	.icon-wrap {
		width: 18px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Right-page-viewport: creates containing block so fixed modals/bars scope to this column */
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
	}

	@media (max-width: 767px) {
		.content {
			border-left: none;
		}
	}

	.panel-content {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-content.has-bottom-bar {
		padding-bottom: 100px;
	}

	.forum-list {
		display: flex;
		flex-direction: column;
		padding: 0;
		gap: 0;
		flex: 1;
		overflow-y: auto;
	}

	.loading-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 60px 24px;
		color: hsl(var(--white33));
		font-size: 0.9375rem;
	}

	.empty-state-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 40px 24px;
	}

	.section-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
		padding: 60px 24px;
	}

	/* Detail view */
	.panel-content-detail {
		position: relative;
	}

	.detail-scroll {
		flex: 1;
		overflow-y: auto;
		padding-bottom: 120px;
	}

	.detail-back-row {
		position: sticky;
		top: 0;
		z-index: 10;
		padding: 12px 20px 10px;
		border-bottom: 1px solid hsl(var(--white8));
		background: hsl(var(--background) / 0.9);
		backdrop-filter: blur(12px);
	}

	.back-btn {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--white66));
		padding: 4px 0;
	}

	.back-btn:hover {
		color: hsl(var(--foreground));
	}

	.detail-post-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 20px 24px 10px;
	}

	.detail-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.detail-author-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.detail-time {
		font-size: 0.75rem;
		color: hsl(var(--white33));
	}

	.detail-title {
		font-size: 1.375rem;
		font-weight: 700;
		line-height: 1.3;
		margin: 0 0 12px;
		padding: 0 24px;
		color: hsl(var(--foreground));
	}

	.detail-labels {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		padding: 0 24px 14px;
	}

	.detail-label {
		font-size: 0.6875rem;
		font-weight: 500;
		padding: 2px 10px;
		border-radius: 99px;
		background: hsl(var(--primary) / 0.12);
		color: hsl(var(--primary));
	}

	.detail-content {
		font-size: 0.9375rem;
		line-height: 1.7;
		color: hsl(var(--foreground) / 0.9);
		white-space: pre-wrap;
		word-break: break-word;
		padding: 0 24px 28px;
	}

	.comments-section {
		border-top: 1px solid hsl(var(--white8));
		padding: 20px 24px 0;
	}

	.comments-heading {
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: hsl(var(--white33));
		margin: 0 0 16px;
	}

	.comments-empty {
		font-size: 0.875rem;
		color: hsl(var(--white33));
		padding: 4px 0 20px;
		margin: 0;
	}

	.comment {
		display: flex;
		gap: 10px;
		padding: 12px 0;
		border-bottom: 1px solid hsl(var(--white4));
	}

	.comment:last-child {
		border-bottom: none;
	}

	.comment-body {
		flex: 1;
		min-width: 0;
	}

	.comment-meta {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-bottom: 4px;
	}

	.comment-author {
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.comment-time {
		font-size: 0.75rem;
		color: hsl(var(--white33));
	}

	.comment-content {
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--foreground) / 0.85);
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
	}

	.detail-bottom-spacer {
		height: 40px;
	}

	/* BottomBar (detail) */
	.bottom-bar-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 40;
		display: flex;
		justify-content: center;
		pointer-events: none;
		transition: transform 0.25s cubic-bezier(0.33, 1, 0.68, 1), opacity 0.2s ease;
	}

	.bottom-bar-wrapper.bar-out .bottom-bar,
	.bottom-bar-wrapper.bar-out .bottom-bar-comment-form {
		transform: translateY(100%);
		opacity: 0;
	}

	.bottom-bar {
		pointer-events: auto;
		width: 100%;
		background: hsl(var(--gray66));
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid hsl(var(--white8));
		border-bottom: none;
		box-shadow: 0 -4px 24px hsl(var(--black));
		padding: 12px;
		backdrop-filter: blur(24px);
		display: flex;
		align-items: center;
		gap: 10px;
	}

	@media (min-width: 768px) {
		.bottom-bar {
			max-width: 560px;
			border-radius: 24px;
			margin-bottom: 16px;
			box-shadow: 0 40px 64px 12px hsl(var(--black));
		}
	}

	.zap-btn {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 0 18px 0 14px;
	}

	.reply-input-btn {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 14px;
		height: 40px;
		background: hsl(var(--white4));
		border: 0.33px solid hsl(var(--white16));
		border-radius: 12px;
		cursor: pointer;
		text-align: left;
		color: hsl(var(--foreground));
	}

	.reply-input-btn:hover {
		background: hsl(var(--white8));
	}

	.reply-placeholder {
		font-size: 0.875rem;
		color: hsl(var(--white33));
		flex: 1;
	}

	.icon-btn {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		border-radius: 10px;
		cursor: pointer;
		color: hsl(var(--white33));
	}

	.icon-btn:hover {
		background: hsl(var(--white8));
		color: hsl(var(--foreground));
	}

	.guest-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
	}

	.guest-bar-text {
		font-size: 0.875rem;
		color: hsl(var(--white33));
	}

	.bottom-bar-comment-form {
		pointer-events: auto;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 40;
		display: flex;
		justify-content: center;
	}

	.comment-form-card {
		width: 100%;
		background: hsl(var(--gray66));
		border-radius: 24px 24px 0 0;
		border: 0.33px solid hsl(var(--white8));
		border-bottom: none;
		box-shadow: 0 -4px 24px hsl(var(--black));
		padding: 16px 16px 20px;
		backdrop-filter: blur(24px);
	}

	@media (min-width: 768px) {
		.comment-form-card {
			max-width: 560px;
			border-radius: 24px;
			margin-bottom: 16px;
			box-shadow: 0 40px 64px 12px hsl(var(--black));
		}
	}

	.comment-textarea {
		display: block;
		width: 100%;
		background: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white16));
		border-radius: 12px;
		color: hsl(var(--foreground));
		font-size: 0.9375rem;
		font-family: inherit;
		line-height: 1.5;
		padding: 10px 14px;
		resize: none;
		box-sizing: border-box;
		margin-bottom: 10px;
	}

	.comment-form-error {
		font-size: 0.8125rem;
		color: hsl(var(--destructive));
		margin: 6px 0 0;
	}

	.comment-form-row {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.cancel-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 32px;
		padding: 0 14px;
		font-size: 14px;
		font-weight: 500;
		color: hsl(var(--white66));
		background: hsl(var(--white8));
		border: none;
		border-radius: 9999px;
		cursor: pointer;
	}

	.cancel-btn:hover {
		background: hsl(var(--white16));
		color: hsl(var(--foreground));
	}

	/* Zap modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 48;
		background: hsl(var(--black) / 0.65);
		backdrop-filter: blur(4px);
	}

	.zap-modal {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 50;
		background: hsl(var(--card));
		border-radius: 24px 24px 0 0;
		border: 0.33px solid hsl(var(--white16));
		border-bottom: none;
		box-shadow: 0 -8px 40px hsl(var(--black));
		padding: 24px 24px 36px;
		max-width: 560px;
		margin: 0 auto;
	}

	@media (min-width: 768px) {
		.zap-modal {
			border-radius: 24px;
			bottom: 24px;
		}
	}

	.zap-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20px;
	}

	.zap-modal-title {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.zap-amounts {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 8px;
		margin-bottom: 16px;
	}

	.zap-amount-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 10px 4px 8px;
		font-size: 0.875rem;
		font-weight: 600;
		border-radius: 12px;
		border: 0.33px solid hsl(var(--white16));
		background: hsl(var(--white4));
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: background 0.12s, border-color 0.12s, color 0.12s;
	}

	.zap-amount-btn:hover {
		background: hsl(var(--white8));
		color: hsl(var(--foreground));
	}

	.zap-amount-btn.selected {
		background: hsl(var(--primary) / 0.14);
		border-color: hsl(var(--primary) / 0.4);
		color: hsl(var(--primary));
	}

	.zap-sats-label {
		font-size: 0.6875rem;
		font-weight: 400;
		opacity: 0.7;
		margin-top: 2px;
	}

	.zap-field {
		margin-bottom: 12px;
	}

	.zap-field-label {
		display: block;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: hsl(var(--white33));
		margin-bottom: 6px;
	}

	.zap-input {
		display: block;
		width: 100%;
		background: hsl(var(--white4));
		border: 0.33px solid hsl(var(--white16));
		border-radius: 10px;
		color: hsl(var(--foreground));
		font-size: 0.9375rem;
		font-family: inherit;
		padding: 10px 14px;
		box-sizing: border-box;
	}

	.zap-error {
		font-size: 0.8125rem;
		color: hsl(var(--destructive));
		margin: 0 0 12px;
	}

	.zap-confirm-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		width: 100%;
	}

	.zap-invoice-view {
		text-align: center;
	}

	.zap-invoice-label {
		font-size: 0.8125rem;
		color: hsl(var(--white33));
		margin: 0 0 10px;
	}

	.zap-invoice-code {
		display: block;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		color: hsl(var(--white66));
		background: hsl(var(--white4));
		padding: 10px 14px;
		border-radius: 10px;
		word-break: break-all;
		margin-bottom: 16px;
	}

</style>
