<script lang="js">
/**
 * NostrRefCard - Renders a Nostr reference card in posts/comments.
 * Supports app naddr cards and forum/comment nevent cards.
 */
import { onMount } from 'svelte';
import { queryEvent } from '$lib/nostr/dexie';
import { nip19 } from 'nostr-tools';
import { decodeNaddr, parseApp, parseForumPost, parseProfile } from '$lib/nostr/models';
import { parseComment } from '$lib/nostr/service';
import { EVENT_KINDS } from '$lib/config';
import ProfilePic from '$lib/components/common/ProfilePic.svelte';
import Timestamp from '$lib/components/common/Timestamp.svelte';
import ShortTextPreview from '$lib/components/common/ShortTextPreview.svelte';
import { hexToColor, getProfileTextColor, rgbToCssString } from '$lib/utils/color.js';

let {
	/** Bech32 naddr/nevent/note or full nostr:* URI */
	naddrRaw = '',
	class: className = ''
} = $props();

const refRaw = $derived(naddrRaw.startsWith('nostr:') ? naddrRaw.slice(6) : naddrRaw);
const refType = $derived.by(() => {
	if (!refRaw) return '';
	try {
		return nip19.decode(refRaw).type;
	} catch {
		return '';
	}
});
const isAppRef = $derived(refType === 'naddr');
const isForumRef = $derived(refType === 'nevent' || refType === 'note');

let app = $state(null);
let refEvent = $state(null);
let authorProfile = $state(null);
let isDarkMode = $state(true);

onMount(() => {
	if (!refRaw || typeof window === 'undefined') return;
	let cancelled = false;

	(async () => {
		let decoded;
		try {
			decoded = nip19.decode(refRaw);
		} catch {
			return;
		}

		if (decoded.type === 'naddr') {
			const pointer = decodeNaddr(refRaw);
			if (!pointer || pointer.kind !== EVENT_KINDS.APP) return;
			const event = await queryEvent({
				kinds: [EVENT_KINDS.APP],
				authors: [pointer.pubkey],
				'#d': [pointer.identifier]
			});
			if (!cancelled && event) app = parseApp(event);
			return;
		}

		if (decoded.type === 'nevent' || decoded.type === 'note') {
			const id = decoded.type === 'nevent' ? decoded.data.id : decoded.data;
			if (!id) return;
			const event = await queryEvent({ ids: [id], limit: 1 });
			if (cancelled || !event) return;
			refEvent = event;

			const profileEvent = await queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [event.pubkey], limit: 1 });
			if (!cancelled && profileEvent) authorProfile = parseProfile(profileEvent);
		}
	})();

	return () => {
		cancelled = true;
	};
});

onMount(() => {
	const mq = window.matchMedia('(prefers-color-scheme: dark)');
	isDarkMode = mq.matches;
	const handle = (e) => (isDarkMode = e.matches);
	mq.addEventListener('change', handle);
	return () => mq.removeEventListener('change', handle);
});

const forumPost = $derived(refEvent?.kind === EVENT_KINDS.FORUM_POST ? parseForumPost(refEvent) : null);
const comment = $derived(refEvent?.kind === EVENT_KINDS.COMMENT ? parseComment(refEvent) : null);
const forumAuthorName = $derived(
	authorProfile?.displayName?.trim() ||
	authorProfile?.name?.trim() ||
	(refEvent?.pubkey ? `${refEvent.pubkey.slice(0, 8)}...` : 'Unknown')
);
const forumCardContent = $derived.by(() => {
	if (forumPost) {
		return forumPost.content ?? '';
	}
	return comment?.content ?? '';
});
const forumCardEmojiTags = $derived(forumPost?.emojiTags ?? comment?.emojiTags ?? []);
const forumCardMediaUrls = $derived(forumPost?.mediaUrls ?? comment?.mediaUrls ?? []);
const forumCardTimestamp = $derived(forumPost?.createdAt ?? comment?.createdAt ?? null);
const isCommentRef = $derived(refEvent?.kind === EVENT_KINDS.COMMENT);
const commentAuthorNameStyle = $derived.by(() => {
	if (!isCommentRef || !refEvent?.pubkey) return '';
	const rgb = hexToColor(refEvent.pubkey);
	const textRgb = getProfileTextColor(rgb, isDarkMode);
	return `color: ${rgbToCssString(textRgb)}`;
});

function resolveForumHref() {
	if (!refEvent) return '';
	if (refEvent.kind === EVENT_KINDS.FORUM_POST) {
		try {
			const nevent = nip19.neventEncode({ id: refEvent.id });
			return `/community/forum/${nevent}`;
		} catch {
			return '';
		}
	}
	if (refEvent.kind === EVENT_KINDS.COMMENT) {
		const rootId =
			refEvent.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ??
			refEvent.tags?.find((t) => t[0] === 'e' && t[3] === 'root' && t[1])?.[1] ??
			refEvent.tags?.find((t) => t[0] === 'e' && t[1])?.[1] ??
			'';
		if (!rootId) return '';
		try {
			const nevent = nip19.neventEncode({ id: rootId });
			return `/community/forum/${nevent}?comment=${refEvent.id}`;
		} catch {
			return '';
		}
	}
	return '';
}

const forumHref = $derived(resolveForumHref());

function stopCardEventBubble(e) {
	e.stopPropagation();
}
</script>

{#if refRaw}
	{#if refEvent && (forumPost || comment)}
		<a
			href={forumHref || '#'}
			class="nostr-ref-card nostr-ref-card--forum {className}"
			class:nostr-ref-card--forum-post={!!forumPost}
			class:nostr-ref-card--comment={!!comment}
			data-kind={refEvent.kind === EVENT_KINDS.FORUM_POST ? 'forum_post' : 'comment'}
			onclick={stopCardEventBubble}
			onkeydown={stopCardEventBubble}
		>
			<div class="nostr-ref-forum-inner">
				<div class="nostr-ref-forum-header">
					<div class="nostr-ref-forum-author">
						<ProfilePic
							pictureUrl={authorProfile?.picture ?? null}
							name={authorProfile?.displayName ?? authorProfile?.name ?? null}
							pubkey={refEvent?.pubkey ?? null}
							size="xs"
							onClick={() => {}}
						/>
						<span class="nostr-ref-forum-author-name" style={commentAuthorNameStyle}>{forumAuthorName}</span>
					</div>
					<Timestamp timestamp={forumCardTimestamp} size="xs" className="nostr-ref-forum-timestamp" />
				</div>
				{#if forumPost}
					<div class="nostr-ref-forum-title">{forumPost.title}</div>
				{:else}
					<div class="nostr-ref-forum-content">
						<ShortTextPreview
							content={forumCardContent}
							emojiTags={forumCardEmojiTags}
							mediaUrls={forumCardMediaUrls}
							maxLines={2}
						/>
					</div>
				{/if}
			</div>
		</a>
	{:else if isAppRef}
	<a
		href="/apps/{refRaw}"
		class="nostr-ref-card {className}"
		data-kind="app"
		onclick={stopCardEventBubble}
		onkeydown={stopCardEventBubble}
	>
		<div class="nostr-ref-card-inner">
			{#if app}
				<div class="nostr-ref-card-pic">
					{#if app.icon}
						<img src={app.icon} alt="" loading="lazy" />
					{:else}
						<span class="nostr-ref-card-initial">{ (app.name || app.dTag || '?').trim()[0]?.toUpperCase() ?? '?' }</span>
					{/if}
				</div>
				<span class="nostr-ref-card-name">{app.name || app.dTag}</span>
			{:else}
				<span class="nostr-ref-card-placeholder">App</span>
			{/if}
		</div>
	</a>
	{:else if isForumRef}
		<div class="nostr-ref-card nostr-ref-card--forum {className}" data-kind="forum_ref">
			<div class="nostr-ref-forum-inner">
				<span class="nostr-ref-card-placeholder">Forum post</span>
			</div>
		</div>
	{/if}
{/if}

<style>
	.nostr-ref-card {
		display: inline-block;
		text-decoration: none;
		color: inherit;
		margin: 0.25rem 0;
		border-radius: 12px;
		overflow: hidden;
		transition: opacity 0.15s ease;
	}
	.nostr-ref-card:hover {
		opacity: 0.9;
	}

	.nostr-ref-card,
	.nostr-ref-card:hover,
	.nostr-ref-card:focus,
	.nostr-ref-card:active {
		text-decoration: none !important;
	}
	.nostr-ref-card-inner {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 8px 16px 8px 8px;
		background: var(--white8);
		border-radius: 12px;
	}
	.nostr-ref-card-name {
		font-size: 15px;
		font-weight: 500;
		color: var(--white);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 200px;
	}
	.nostr-ref-card-placeholder {
		font-size: 14px;
		font-weight: 500;
		color: var(--white33);
	}
	.nostr-ref-card-pic {
		width: 38px;
		height: 38px;
		flex-shrink: 0;
		border-radius: 8px;
		border: 0.33px solid var(--white16);
		background: var(--gray66);
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.nostr-ref-card-pic img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.nostr-ref-card-initial {
		font-size: 18px;
		font-weight: 700;
		color: var(--white66);
	}

	.nostr-ref-card--forum {
		display: block;
	}

	.nostr-ref-forum-inner {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 12px;
		background: var(--white8);
		border-radius: 12px;
		max-width: min(520px, 90vw);
	}

	.nostr-ref-forum-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		min-width: 0;
	}

	.nostr-ref-forum-author {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.nostr-ref-forum-author-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--white);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.nostr-ref-forum-timestamp {
		color: var(--white33) !important;
	}

	.nostr-ref-forum-content {
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--white66);
	}

	.nostr-ref-card--forum-post .nostr-ref-forum-author-name {
		font-weight: 500;
		color: var(--white66);
	}

	.nostr-ref-card--comment .nostr-ref-forum-author-name {
		font-weight: 600;
	}

	.nostr-ref-forum-title {
		font-size: 0.96rem;
		line-height: 1.35;
		font-weight: 600;
		color: var(--white);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.nostr-ref-forum-content--single-line {
		color: var(--white33);
	}

	.nostr-ref-forum-content--single-line :global(.short-text-preview) {
		color: var(--white33);
	}
</style>
