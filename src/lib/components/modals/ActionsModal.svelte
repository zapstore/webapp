<script lang="js">
	/**
	 * ActionsModal — Unified bottom sheet: Comment CTA, Actions (Details / Label / Share),
	 * optional Stacks (apps), Report / Delete. Sub-panels replace content in the same sheet.
	 */
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { browser } from '$app/environment';
	import { nip19 } from 'nostr-tools';
	import Modal from '$lib/components/common/Modal.svelte';
	import DetailsTab from '$lib/components/social/DetailsTab.svelte';
	import QuotedMessage from '$lib/components/social/QuotedMessage.svelte';
	import QuotedZapMessage from '$lib/components/social/QuotedZapMessage.svelte';
	import CommentModalRootRow from '$lib/components/social/CommentModalRootRow.svelte';
	import CommentModal from '$lib/components/modals/CommentModal.svelte';
	import ReportModal from '$lib/components/modals/ReportModal.svelte';
	import InputLabel from '$lib/components/common/InputLabel.svelte';
	import LabelChip from '$lib/components/common/Label.svelte';
	import AppSmallStackCard from '$lib/components/cards/AppSmallStackCard.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import {
		Reply,
		Details,
		Label,
		Share,
		Id,
		Copy,
		Check,
		Plus
	} from '$lib/components/icons';
	import { wheelScroll } from '$lib/actions/wheelScroll.js';
	import {
		queryEvent,
		queryEvents,
		liveQuery,
		publishTopicLabelOnEvent,
		publishAddressableLabel,
		publishForumPostLabel,
		publishLabelDeletion,
		publishDeletionRequest,
		publishStack,
		updateStackApps
	} from '$lib/purpleweb';
	import { parseAppStack, parseApp } from '$lib/nostr';
	import {
		signEvent as authSignEvent,
		getIsSignedIn,
		getCurrentPubkey as authGetCurrentPubkey
	} from '$lib/stores/auth.svelte.js';
	import {
		EVENT_KINDS,
		FORUM_CATEGORIES,
		SITE_URL,
		COMMENT_PUBLISH_RELAYS,
		ZAPSTORE_RELAY,
		DEFAULT_CATALOG_RELAYS,
		ACTIONS_DELETABLE_CONTENT_LABELS
	} from '$lib/config.js';
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import '$lib/styles/comment-modal-inset.css';

	const DEFAULT_EVENT_LABELS = [
		'Security',
		'Privacy',
		'Open Source',
		'Helpful',
		'Question',
		'Feedback'
	];

	const DEFAULT_CATALOG_LABELS = [
		'Security',
		'Privacy',
		'Open Source',
		'Productivity',
		'Social',
		'Developer'
	];

	let {
		open = $bindable(false),
		nestedChildOpen = $bindable(false),
		sheetBackdrop = true,
		authorName = '',
		authorPubkey = null,
		contentPreview = '',
		isZapPreview = false,
		zapAmountSats = 0,
		zapContent = '',
		zapEmojiTags = [],
		/** comment | zap | app | stack | forum */
		contentType = 'comment',
		/** Catalog target (app/stack/forum detail). */
		targetApp = null,
		/** Root app/stack/forum row above Comment CTA (catalog content). */
		rootContext = null,
		version = '',
		targetEventId = '',
		targetEventKind: _targetEventKind = EVENT_KINDS.COMMENT,
		labelCommunityPubkey = null,
		onComment,
		onCommentSubmit = null,
		onDelete = null,
		onLabelPublished = () => {},
		onOwnContentDeleted = () => {},
		onZapReceived = null,
		onZapPending = null,
		onZapPendingClear = null,
		recipientName = '',
		otherZaps = [],
		getCurrentPubkey = () => null,
		searchProfiles = async () => [],
		searchEmojis = async () => [],
		signEvent = null,
		lockBodyScroll = true,
		zIndex = 55,
		scopedInPanel = false
	} = $props();

	const effectiveSignEvent = $derived(signEvent ?? authSignEvent);
	const effectiveGetCurrentPubkey = $derived(getCurrentPubkey ?? authGetCurrentPubkey);
	const isCatalogContent = $derived(['app', 'stack', 'forum'].includes(contentType));
	const showStacksSection = $derived(contentType === 'app');
	const showRootContextRow = $derived(isCatalogContent && Boolean(rootContext));
	const canOpenCommentModal = $derived(isCatalogContent && typeof onCommentSubmit === 'function');

	let commentModalOpen = $state(false);
	let instantDismiss = $state(false);
	let commentReplaceOpen = $state(false);

	const contentTypeLabel = $derived(
		contentType.charAt(0).toUpperCase() + contentType.slice(1)
	);
	const actionsContentNoun = $derived(
		ACTIONS_DELETABLE_CONTENT_LABELS[contentType] ??
			(isZapPreview || contentType === 'zap' ? 'Zap' : 'Comment')
	);

	const displayAuthorLabel = $derived.by(() => {
		const n = String(authorName ?? '').trim();
		if (n && n.toLowerCase() !== 'anonymous') return n;
		const pk = authorPubkey?.trim();
		if (!pk) return '';
		try {
			const enc = nip19.npubEncode(pk);
			return `npub1${enc.slice(5, 8)}…${enc.slice(-6)}`;
		} catch {
			return pk.slice(0, 8);
		}
	});

	/** @type {'main' | 'details' | 'label' | 'share' | 'report'} */
	let subPanel = $state('main');
	let reportEmbedOpen = $state(false);
	let shareFeedback = $state('');
	let shareLinkCopied = $state(false);
	let shareUrlCopied = $state(false);
	let labelInputValue = $state('');
	let labelStructuredKind = $state(/** @type {'alternative' | 'reads' | 'writes' | null} */ (null));
	let labelError = $state('');
	let labelPublishing = $state(false);
	let detailsEvent = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
	let detailsLoading = $state(false);
	let deleteLoading = $state(false);
	let deleteError = $state('');

	let userStacks = $state([]);
	let stacksLoaded = $state(false);
	let updatingStacks = new SvelteSet();
	let createStackOpen = $state(false);
	let stackName = $state('');
	let stackDescription = $state('');
	let stackSaving = $state(false);
	let stackError = $state('');
	/** @type {HTMLInputElement | null} */
	let stackNameInput = $state(null);
	/** @type {HTMLTextAreaElement | null} */
	let stackDescInput = $state(null);

	/** @type {Map<string, string>} */
	let userLabelEventIdsByText = $state(new Map());
	let optimisticAddedLabels = new SvelteSet();

	const currentPubkey = $derived(effectiveGetCurrentPubkey?.() ?? null);
	const isOwnEvent = $derived.by(() => {
		if (isCatalogContent) {
			return Boolean(
				currentPubkey &&
					targetApp?.pubkey &&
					String(currentPubkey).trim().toLowerCase() ===
						String(targetApp.pubkey).trim().toLowerCase()
			);
		}
		const mine = getCurrentPubkey();
		if (!mine || !authorPubkey) return false;
		return String(mine).trim().toLowerCase() === String(authorPubkey).trim().toLowerCase();
	});

	const reportContentType = $derived(
		isCatalogContent ? contentType : isZapPreview || contentType === 'zap' ? 'zap' : 'comment'
	);

	const modalTitle = $derived.by(() => {
		switch (subPanel) {
			case 'details':
				return 'Details';
			case 'label':
				return 'Label';
			case 'share':
				return 'Share';
			case 'report':
				return 'Report';
			default:
				return '';
		}
	});

	const modalDescription = $derived.by(() => {
		if (subPanel !== 'report') return '';
		const name = String(displayAuthorLabel ?? '').trim();
		return name ? `${name}'s ${actionsContentNoun}` : actionsContentNoun;
	});

	const detailsPublicationLabel = $derived.by(() => {
		if (isCatalogContent) return contentTypeLabel;
		return isZapPreview || contentType === 'zap' ? 'Zap receipt' : 'Comment';
	});

	const catalogEventId = $derived.by(() => {
		if (!isCatalogContent || !targetApp) return '';
		return String(targetApp.ownContentEventId ?? targetApp.id ?? '').trim();
	});

	const effectiveTargetEventId = $derived(
		isCatalogContent ? catalogEventId : String(targetEventId ?? '').trim()
	);

	const labelSuggestions = $derived.by(() => {
		if (isCatalogContent) {
			return contentType === 'forum' ? [...FORUM_CATEGORIES] : DEFAULT_CATALOG_LABELS;
		}
		return labelCommunityPubkey ? [...FORUM_CATEGORIES] : DEFAULT_EVENT_LABELS;
	});

	const labelChipsRow = $derived.by(() => {
		if (!isCatalogContent) return labelSuggestions;
		const applied = [...userLabelEventIdsByText.keys()];
		const appliedSet = new Set(applied);
		const optimisticNew = [...optimisticAddedLabels].filter((k) => !appliedSet.has(k));
		const optimisticSet = new Set(optimisticNew);
		const unappliedDefaults = labelSuggestions.filter(
			(k) => !appliedSet.has(k) && !optimisticSet.has(k)
		);
		return [...optimisticNew, ...applied, ...unappliedDefaults];
	});

	const detailsShareableId = $derived.by(() => {
		const id = detailsEvent?.id ?? effectiveTargetEventId;
		if (!id) return '';
		try {
			return nip19.neventEncode({ id });
		} catch {
			return id.slice(0, 16) + '…';
		}
	});

	const detailsNpub = $derived.by(() => {
		const pk = detailsEvent?.pubkey ?? authorPubkey ?? targetApp?.pubkey;
		if (!pk || typeof pk !== 'string') return '';
		try {
			return nip19.npubEncode(pk);
		} catch {
			return '';
		}
	});

	const canShare = $derived(Boolean(effectiveTargetEventId));
	const shareNevent = $derived.by(() => {
		if (!canShare) return '';
		try {
			return nip19.neventEncode({ id: effectiveTargetEventId });
		} catch {
			return '';
		}
	});
	const shareEmbedLink = $derived(shareNevent ? `nostr:${shareNevent}` : '');
	const shareZapstoreUrl = $derived.by(() => {
		if (contentType === 'forum' && shareNevent) {
			return `${SITE_URL}/community/forum/${shareNevent}`;
		}
		if (contentType === 'app' && targetApp?.dTag) {
			return `${SITE_URL}/apps/${targetApp.dTag}`;
		}
		if (contentType === 'stack' && targetApp?.naddr) {
			return `${SITE_URL}/stacks/${targetApp.naddr}`;
		}
		if (shareNevent) return `${SITE_URL}/community/forum/${shareNevent}`;
		return '';
	});
	const shareZapstoreDisplay = $derived(
		shareZapstoreUrl ? shareZapstoreUrl.replace(/^https?:\/\//, '') : ''
	);

	const canLabel = $derived(Boolean(effectiveTargetEventId && effectiveSignEvent));

	function normPk(pk) {
		return String(pk ?? '')
			.trim()
			.toLowerCase();
	}

	/** @param {any[]} events */
	function buildUserLabelEventMap(events) {
		const map = new SvelteMap();
		const sorted = [...events].sort((a, b) => b.created_at - a.created_at);
		for (const ev of sorted) {
			for (const t of ev.tags ?? []) {
				if (t[0] === 'l' && t[1]) {
					const text = String(t[1]);
					if (!map.has(text)) map.set(text, ev.id);
				}
			}
		}
		return map;
	}

	function catalogLabelSubscriptionFilter() {
		if (!currentPubkey) return null;
		const pk = normPk(currentPubkey);
		if (contentType === 'forum') {
			const id = targetApp?.id?.trim();
			const h = targetApp?.communityPubkey?.trim();
			if (!id || !h) return null;
			return {
				kinds: [EVENT_KINDS.LABEL],
				authors: [pk],
				'#e': [normPk(id)],
				'#h': [normPk(h)]
			};
		}
		if (!targetApp?.pubkey || !targetApp?.dTag) return null;
		const aKind = contentType === 'stack' ? EVENT_KINDS.APP_STACK : EVENT_KINDS.APP;
		const aTag = `${aKind}:${normPk(targetApp.pubkey)}:${String(targetApp.dTag).trim()}`;
		return { kinds: [EVENT_KINDS.LABEL], authors: [pk], '#a': [aTag] };
	}

	/** @param {string} label */
	function chipLabelIsSelected(label) {
		if (optimisticAddedLabels.has(label)) return true;
		return userLabelEventIdsByText.has(label);
	}

	function chooseComment() {
		if (canOpenCommentModal) {
			commentReplaceOpen = true;
			commentModalOpen = true;
			instantDismiss = true;
			open = false;
			requestAnimationFrame(() => {
				instantDismiss = false;
				commentReplaceOpen = false;
			});
			return;
		}
		open = false;
		onComment?.();
	}

	function handleCommentModalSubmit(event) {
		onCommentSubmit?.({
			text: event.text,
			emojiTags: event.emojiTags,
			mentions: event.mentions,
			mediaUrls: event.mediaUrls,
			parentId: undefined,
			target: event.target ?? targetApp
		});
	}

	function goMain() {
		subPanel = 'main';
		reportEmbedOpen = false;
	}

	function openDetailsPanel() {
		subPanel = 'details';
	}

	function openLabelPanel() {
		if (!canLabel) return;
		subPanel = 'label';
		labelError = '';
	}

	function openSharePanel() {
		if (!canShare) return;
		subPanel = 'share';
		shareFeedback = '';
	}

	function openReportPanel() {
		subPanel = 'report';
		reportEmbedOpen = true;
	}

	async function copyNeventToClipboard() {
		shareFeedback = '';
		if (!browser || !shareEmbedLink) return;
		try {
			await navigator.clipboard.writeText(shareEmbedLink);
			shareLinkCopied = true;
			shareFeedback = 'Copied embed link';
		} catch {
			shareFeedback = 'Could not copy';
			return;
		}
		setTimeout(() => {
			shareLinkCopied = false;
			shareFeedback = '';
		}, 2000);
	}

	async function copyZapstoreUrlToClipboard() {
		shareFeedback = '';
		if (!browser || !shareZapstoreUrl) return;
		try {
			await navigator.clipboard.writeText(shareZapstoreUrl);
			shareUrlCopied = true;
			shareFeedback = 'Copied zapstore.dev URL';
		} catch {
			shareFeedback = 'Could not copy';
			return;
		}
		setTimeout(() => {
			shareUrlCopied = false;
			shareFeedback = '';
		}, 2000);
	}

	function assertCatalogLabelTarget() {
		if (contentType === 'forum') {
			if (!targetApp?.id?.trim() || !targetApp?.communityPubkey?.trim()) {
				labelError = 'Nothing to attach this label to';
				return false;
			}
		} else if (!targetApp?.pubkey || !targetApp?.dTag) {
			labelError = 'Nothing to attach this label to';
			return false;
		}
		return true;
	}

	async function publishEventLabelText(raw) {
		const body = String(raw ?? '').trim();
		if (!body || !effectiveSignEvent || !effectiveTargetEventId) return;
		if (!getIsSignedIn()) {
			labelError = 'Please sign in to add a label';
			return;
		}
		labelError = '';
		labelPublishing = true;
		try {
			await publishTopicLabelOnEvent(effectiveSignEvent, {
				eventId: effectiveTargetEventId,
				labelValue: body,
				communityPubkey: labelCommunityPubkey ?? undefined
			});
			labelInputValue = '';
			onLabelPublished();
		} catch (err) {
			labelError = err instanceof Error ? err.message : 'Failed to publish label';
		} finally {
			labelPublishing = false;
		}
	}

	async function toggleCatalogChipLabel(/** @type {string} */ label) {
		if (labelPublishing) return;
		if (!getIsSignedIn()) {
			labelError = 'Please sign in to add a label';
			return;
		}
		if (!assertCatalogLabelTarget()) return;

		const applied = chipLabelIsSelected(label);
		const existingEventId = userLabelEventIdsByText.get(label);

		if (applied) {
			if (!existingEventId) return;
			labelError = '';
			labelPublishing = true;
			try {
				await publishLabelDeletion(effectiveSignEvent, existingEventId, [ZAPSTORE_RELAY]);
				onLabelPublished();
			} catch (err) {
				labelError = err instanceof Error ? err.message : 'Failed to remove label';
			} finally {
				labelPublishing = false;
			}
			return;
		}

		labelError = '';
		labelPublishing = true;
		optimisticAddedLabels.add(label);
		try {
			if (contentType === 'forum') {
				await publishForumPostLabel(effectiveSignEvent, {
					eventId: targetApp.id,
					communityPubkey: targetApp.communityPubkey,
					labelValue: label
				});
			} else {
				await publishAddressableLabel(effectiveSignEvent, {
					pubkey: targetApp.pubkey,
					identifier: targetApp.dTag,
					contentType,
					labelValue: label
				});
			}
			onLabelPublished();
		} catch (err) {
			labelError = err instanceof Error ? err.message : 'Failed to publish label';
			optimisticAddedLabels.delete(label);
		} finally {
			optimisticAddedLabels.delete(label);
			labelPublishing = false;
		}
	}

	async function handleCatalogPublishLabel() {
		const body = labelInputValue.trim();
		if (!body) return;
		if (!getIsSignedIn()) {
			labelError = 'Please sign in to add a label';
			return;
		}
		if (!assertCatalogLabelTarget()) return;

		const labelPayload = labelStructuredKind ? `${labelStructuredKind}:${body}` : body;
		const existingEventId = userLabelEventIdsByText.get(labelPayload);
		const applied = chipLabelIsSelected(labelPayload);

		if (applied && existingEventId) {
			labelError = '';
			labelPublishing = true;
			try {
				await publishLabelDeletion(effectiveSignEvent, existingEventId, [ZAPSTORE_RELAY]);
				labelInputValue = '';
				labelStructuredKind = null;
				onLabelPublished();
			} catch (err) {
				labelError = err instanceof Error ? err.message : 'Failed to remove label';
			} finally {
				labelPublishing = false;
			}
			return;
		}

		labelError = '';
		labelPublishing = true;
		optimisticAddedLabels.add(labelPayload);
		try {
			if (contentType === 'forum') {
				await publishForumPostLabel(effectiveSignEvent, {
					eventId: targetApp.id,
					communityPubkey: targetApp.communityPubkey,
					labelValue: labelPayload
				});
			} else {
				await publishAddressableLabel(effectiveSignEvent, {
					pubkey: targetApp.pubkey,
					identifier: targetApp.dTag,
					contentType,
					labelValue: labelPayload
				});
			}
			labelInputValue = '';
			labelStructuredKind = null;
			onLabelPublished();
		} catch (err) {
			labelError = err instanceof Error ? err.message : 'Failed to publish label';
			optimisticAddedLabels.delete(labelPayload);
		} finally {
			optimisticAddedLabels.delete(labelPayload);
			labelPublishing = false;
		}
	}

	async function handleLabelChipTap(label) {
		if (isCatalogContent) {
			await toggleCatalogChipLabel(label);
		} else {
			await publishEventLabelText(label);
		}
	}

	async function handleLabelAdd() {
		if (isCatalogContent) {
			await handleCatalogPublishLabel();
		} else {
			await publishEventLabelText(labelInputValue);
		}
	}

	async function deleteMyContent() {
		if (!effectiveSignEvent || deleteLoading) return;
		deleteError = '';
		deleteLoading = true;
		try {
			if (isCatalogContent) {
				if (!isOwnEvent || !targetApp) return;
				if (contentType === 'forum') {
					await publishDeletionRequest(effectiveSignEvent, {
						eventId: targetApp.id,
						eventKind: EVENT_KINDS.FORUM_POST,
						relays: [ZAPSTORE_RELAY]
					});
				} else if (contentType === 'app') {
					const appEvId = String(targetApp.ownContentEventId ?? targetApp.id ?? '').trim();
					await publishDeletionRequest(effectiveSignEvent, {
						eventId: appEvId,
						eventKind: EVENT_KINDS.APP,
						aTagValue: `${EVENT_KINDS.APP}:${normPk(targetApp.pubkey)}:${String(targetApp.dTag).trim()}`,
						relays: DEFAULT_CATALOG_RELAYS
					});
				} else if (contentType === 'stack') {
					await publishDeletionRequest(effectiveSignEvent, {
						eventId: targetApp.id,
						eventKind: EVENT_KINDS.APP_STACK,
						aTagValue: `${EVENT_KINDS.APP_STACK}:${normPk(targetApp.pubkey)}:${String(targetApp.dTag).trim()}`,
						relays: DEFAULT_CATALOG_RELAYS
					});
				}
				open = false;
				onOwnContentDeleted();
				return;
			}

			const id = effectiveTargetEventId.toLowerCase();
			if (isZapPreview || contentType === 'zap') {
				const ev = await queryEvent({ ids: [id] });
				const zTag = ev?.tags?.find((t) => t[0] === 'z' && typeof t[1] === 'string' && t[1]);
				if (zTag) {
					const receiptId = String(zTag[1]).trim().toLowerCase();
					await Promise.all([
						publishDeletionRequest(effectiveSignEvent, {
							eventId: id,
							eventKind: EVENT_KINDS.COMMENT,
							relays: COMMENT_PUBLISH_RELAYS
						}),
						/^[a-f0-9]{64}$/.test(receiptId)
							? publishDeletionRequest(effectiveSignEvent, {
									eventId: receiptId,
									eventKind: EVENT_KINDS.ZAP_RECEIPT,
									relays: COMMENT_PUBLISH_RELAYS
								})
							: Promise.resolve()
					]);
				} else {
					await publishDeletionRequest(effectiveSignEvent, {
						eventId: id,
						eventKind: EVENT_KINDS.ZAP_RECEIPT,
						relays: COMMENT_PUBLISH_RELAYS
					});
				}
			} else {
				await publishDeletionRequest(effectiveSignEvent, {
					eventId: id,
					eventKind: EVENT_KINDS.COMMENT,
					relays: COMMENT_PUBLISH_RELAYS
				});
			}
			open = false;
			onDelete?.();
		} catch (err) {
			deleteError = err instanceof Error ? err.message : 'Failed to delete';
		} finally {
			deleteLoading = false;
		}
	}

	function stackContainsApp(stack) {
		if (!targetApp?.pubkey || !targetApp?.dTag) return false;
		const appATag = `${EVENT_KINDS.APP}:${targetApp.pubkey}:${targetApp.dTag}`;
		return stack.event?.tags?.some((t) => t[0] === 'a' && t[1] === appATag) ?? false;
	}

	async function handleStackClick(stack) {
		if (!targetApp?.pubkey || !targetApp?.dTag || !stack.event) return;
		if (updatingStacks.has(stack.id)) return;

		const hasApp = stackContainsApp(stack);
		const action = hasApp ? 'remove' : 'add';
		updatingStacks.add(stack.id);
		try {
			const plainEvent = JSON.parse(JSON.stringify(stack.event));
			const plainApp = { pubkey: targetApp.pubkey, dTag: targetApp.dTag };
			await updateStackApps(plainEvent, plainApp, action, effectiveSignEvent);
		} catch (err) {
			console.error('[ActionsModal] stack update failed:', err);
		} finally {
			updatingStacks.delete(stack.id);
		}
	}

	function openCreateStack() {
		createStackOpen = true;
		stackError = '';
	}

	async function handleSaveStack() {
		if (!stackName.trim() || stackSaving) return;
		if (!getIsSignedIn()) {
			stackError = 'Please sign in to create a stack';
			return;
		}
		stackSaving = true;
		stackError = '';
		try {
			const apps = targetApp ? [targetApp] : [];
			await publishStack(stackName.trim(), stackDescription.trim(), apps, effectiveSignEvent);
			createStackOpen = false;
			stackName = '';
			stackDescription = '';
		} catch (err) {
			stackError = err instanceof Error ? err.message : 'Failed to create stack';
		} finally {
			stackSaving = false;
		}
	}

	$effect(() => {
		nestedChildOpen = subPanel !== 'main' || createStackOpen || commentModalOpen;
	});

	$effect(() => {
		if (createStackOpen) {
			const t = globalThis.setTimeout(() => stackNameInput?.focus(), 80);
			return () => globalThis.clearTimeout(t);
		}
	});

	$effect(() => {
		if (!browser || subPanel !== 'details' || !effectiveTargetEventId) {
			if (subPanel !== 'details') detailsEvent = null;
			return;
		}
		detailsLoading = true;
		detailsEvent = null;
		let cancelled = false;
		queryEvent({ ids: [effectiveTargetEventId] })
			.then((ev) => {
				if (!cancelled) detailsEvent = ev ?? null;
			})
			.catch(() => {
				if (!cancelled) detailsEvent = null;
			})
			.finally(() => {
				if (!cancelled) detailsLoading = false;
			});
		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (!browser || !open || !isCatalogContent || !currentPubkey) {
			userLabelEventIdsByText = new Map();
			return;
		}
		const filter = catalogLabelSubscriptionFilter();
		if (!filter) {
			userLabelEventIdsByText = new Map();
			return;
		}
		const sub = liveQuery(() => queryEvents(filter)).subscribe({
			next: (evs) => {
				userLabelEventIdsByText = buildUserLabelEventMap(evs ?? []);
			},
			error: (err) => {
				console.error('[ActionsModal] user label query', err);
			}
		});
		return () => sub.unsubscribe();
	});

	$effect(() => {
		if (!browser || !open || !isCatalogContent || contentType !== 'app' || !currentPubkey) {
			userStacks = [];
			stacksLoaded = false;
			return;
		}
		const subscription = liveQuery(() =>
			queryEvents({ kinds: [EVENT_KINDS.APP_STACK], authors: [currentPubkey] })
		).subscribe({
			next: async (stackEvents) => {
				const parsedStacks = stackEvents.map(parseAppStack);
				const allIds = new SvelteSet();
				for (const s of parsedStacks) {
					for (const ref of s.appRefs || []) {
						if (ref.kind === EVENT_KINDS.APP) allIds.add(ref.identifier);
					}
				}
				let appsByKey = new SvelteMap();
				if (allIds.size > 0) {
					const appEvents = await queryEvents({ kinds: [EVENT_KINDS.APP], '#d': [...allIds] });
					for (const e of appEvents) {
						const a = parseApp(e);
						if (a.pubkey && a.dTag) appsByKey.set(`${a.pubkey}:${a.dTag}`, a);
					}
				}
				userStacks = parsedStacks.map((stack, index) => ({
					id: stack.id,
					name: stack.title,
					event: stackEvents[index],
					apps: (stack.appRefs || [])
						.filter((ref) => ref.kind === EVENT_KINDS.APP)
						.map((ref) => {
							const app = appsByKey.get(`${ref.pubkey}:${ref.identifier}`);
							return app ? { icon: app.icon, name: app.name, dTag: app.dTag } : null;
						})
						.filter(Boolean)
				}));
				stacksLoaded = true;
			},
			error: () => {
				stacksLoaded = true;
			}
		});
		return () => subscription.unsubscribe();
	});

	$effect(() => {
		if (!open) {
			subPanel = 'main';
			reportEmbedOpen = false;
			shareFeedback = '';
			shareLinkCopied = false;
			shareUrlCopied = false;
			labelError = '';
			labelInputValue = '';
			labelStructuredKind = null;
			deleteError = '';
			deleteLoading = false;
			createStackOpen = false;
			stackName = '';
			stackDescription = '';
			stackError = '';
			stackSaving = false;
			updatingStacks.clear();
			optimisticAddedLabels.clear();
			userLabelEventIdsByText = new Map();
		}
	});
</script>

<Modal
	bind:open
	ariaLabel="Actions"
	title={modalTitle}
	description={modalDescription}
	align="bottom"
	wide={true}
	noBackdrop={!sheetBackdrop}
	{zIndex}
	{lockBodyScroll}
	{scopedInPanel}
	instantTransition={instantDismiss}
	class="actions-modal {createStackOpen ? 'actions-modal-child-open' : ''}"
>
	<div class="am-inner">
		<div class="child-overlay" class:visible={createStackOpen} aria-hidden="true"></div>

		{#if subPanel === 'main'}
			{#if showRootContextRow && rootContext}
				<div class="am-catalog-root-block">
					<CommentModalRootRow {rootContext} {version} showConnector={true} />
					<button type="button" class="am-comment-card am-comment-card--plain" onclick={chooseComment}>
						<div class="am-comment-card-footer">
							<Reply
								variant="outline"
								size={18}
								strokeWidth={1.4}
								color="var(--white33)"
								className="am-comment-card-icon"
							/>
							<span class="am-comment-card-label">Comment</span>
						</div>
					</button>
				</div>
			{:else}
				<button type="button" class="am-comment-card" onclick={chooseComment}>
					<div class="am-comment-card-quote">
						{#if isZapPreview || contentType === 'zap'}
							<QuotedZapMessage
								authorName={displayAuthorLabel}
								{authorPubkey}
								amountSats={zapAmountSats}
								content={zapContent || contentPreview}
								emojiTags={zapEmojiTags}
							/>
						{:else}
							<QuotedMessage
								authorName={displayAuthorLabel}
								{authorPubkey}
								content={contentPreview}
							/>
						{/if}
					</div>
					<div class="am-comment-card-footer">
						<Reply
							variant="outline"
							size={18}
							strokeWidth={1.4}
							color="var(--white33)"
							className="am-comment-card-icon"
						/>
						<span class="am-comment-card-label">Comment</span>
					</div>
				</button>
			{/if}

			{#if showStacksSection && subPanel === 'main'}
				<div class="am-section">
					<h3 class="eyebrow-label am-eyebrow">Add to stacks</h3>
					{#if !stacksLoaded}
						<SkeletonLoader
							width="100%"
							height="100px"
							borderRadius="16px"
							class="am-stacks-loading-skeleton"
						/>
					{:else if userStacks.length === 0}
						<button type="button" class="am-create-stack-empty" onclick={openCreateStack}>
							<Plus variant="outline" size={24} color="var(--white16)" strokeWidth={2} />
							<span>New Stack</span>
						</button>
					{:else}
						<div class="am-stacks-scroll-row" use:wheelScroll>
							<div class="am-stacks-row-inner">
								{#each userStacks as stack (stack.id)}
									<AppSmallStackCard
										{stack}
										hasApp={stackContainsApp(stack)}
										loading={updatingStacks.has(stack.id)}
										onclick={() => handleStackClick(stack)}
									/>
								{/each}
								<button type="button" class="am-create-stack-inline" onclick={openCreateStack}>
									<Plus variant="outline" size={24} color="var(--white16)" strokeWidth={2} />
									<span>New Stack</span>
								</button>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<div class="am-section">
				<h3 class="eyebrow-label am-eyebrow">Actions</h3>
				<div class="am-actions-row">
					<button
						type="button"
						class="am-panel-btn"
						onclick={openDetailsPanel}
						disabled={!effectiveTargetEventId}
					>
						<span class="am-panel-icon-wrap" aria-hidden="true">
							<Details variant="outline" size={24} strokeWidth={1.4} color="var(--white66)" />
						</span>
						<span class="am-panel-label">Details</span>
					</button>
					<button type="button" class="am-panel-btn" onclick={openLabelPanel} disabled={!canLabel}>
						<span class="am-panel-icon-wrap" aria-hidden="true">
							<Label variant="outline" size={24} strokeWidth={1.4} color="var(--white66)" />
						</span>
						<span class="am-panel-label">Label</span>
					</button>
					<button type="button" class="am-panel-btn" onclick={openSharePanel} disabled={!canShare}>
						<span class="am-panel-icon-wrap" aria-hidden="true">
							<Share variant="outline" size={24} strokeWidth={1.4} color="var(--white66)" />
						</span>
						<span class="am-panel-label">Share</span>
					</button>
				</div>
			</div>

			{#if isOwnEvent && effectiveSignEvent}
				<button
					type="button"
					class="am-report-btn am-delete-btn"
					onclick={deleteMyContent}
					disabled={deleteLoading || !effectiveTargetEventId}
					aria-busy={deleteLoading}
				>
					{deleteLoading ? 'Deleting…' : `Delete this ${actionsContentNoun.toLowerCase()}`}
				</button>
				{#if deleteError}
					<p class="am-delete-error" role="alert">{deleteError}</p>
				{/if}
			{:else}
				<button type="button" class="am-report-btn" onclick={openReportPanel}>
					Report this {actionsContentNoun.toLowerCase()}
				</button>
			{/if}
		{:else if subPanel === 'details'}
			<div class="am-subpanel">
				<div class="details-modal-inner am-subpanel-body">
					{#if detailsLoading}
						<p class="details-loading">Loading…</p>
					{:else if detailsEvent}
						<DetailsTab
							shareableId={detailsShareableId}
							publicationLabel={detailsPublicationLabel}
							npub={detailsNpub}
							pubkey={detailsEvent.pubkey ?? ''}
							rawData={detailsEvent}
							shareLink=""
							repository=""
							panelBackground="black33"
						/>
					{:else}
						<p class="details-empty">Could not load this event from your device.</p>
					{/if}
				</div>
			</div>
		{:else if subPanel === 'label'}
			<div class="am-subpanel">
				<div class="am-label-panel am-subpanel-body">
					<InputLabel
						bind:value={labelInputValue}
						bind:structuredKind={labelStructuredKind}
						enableStructuredModes={contentType === 'app'}
						placeholder="Your label"
						onAdd={handleLabelAdd}
						addDisabled={labelPublishing || !getIsSignedIn()}
					/>
					{#if labelError}
						<p class="am-label-error" role="alert">{labelError}</p>
					{/if}
					<div class="labels-scroll-row" use:wheelScroll>
						<div class="labels-row-inner">
							{#each labelChipsRow as label (label)}
								<button
									type="button"
									class="label-tap"
									onclick={() => handleLabelChipTap(label)}
									disabled={labelPublishing || !getIsSignedIn()}
									aria-label={isCatalogContent && chipLabelIsSelected(label)
										? `Remove label ${label}`
										: `Add label ${label}`}
								>
									<LabelChip
										text={label}
										isSelected={isCatalogContent ? chipLabelIsSelected(label) : false}
										isEmphasized={false}
									/>
								</button>
							{/each}
						</div>
					</div>
				</div>
			</div>
		{:else if subPanel === 'share'}
			<div class="am-subpanel">
				<div class="am-share-panel am-subpanel-body">
					<div class="am-share-row">
						<div class="am-share-left">
							<Id variant="outline" size={18} strokeWidth={1.4} color="var(--white66)" />
							<span class="am-share-label">Embed link</span>
						</div>
						<span class="am-share-value" title={shareEmbedLink}>{shareEmbedLink}</span>
						<button
							type="button"
							class="am-share-copy-btn"
							onclick={copyNeventToClipboard}
							disabled={!canShare}
							aria-label="Copy embed link"
						>
							{#if shareLinkCopied}
								<span class="check-icon">
									<Check
										variant="outline"
										size={14}
										strokeWidth={2.8}
										color="var(--blurpleLightColor)"
									/>
								</span>
							{:else}
								<Copy variant="outline" size={16} color="var(--white66)" />
							{/if}
						</button>
					</div>
					<div class="am-share-divider"></div>
					<div class="am-share-row">
						<div class="am-share-left">
							<Share variant="outline" size={18} strokeWidth={1.4} color="var(--white66)" />
							<span class="am-share-label">Zapstore URL</span>
						</div>
						<span class="am-share-value" title={shareZapstoreUrl}>{shareZapstoreDisplay}</span>
						<button
							type="button"
							class="am-share-copy-btn"
							onclick={copyZapstoreUrlToClipboard}
							disabled={!canShare}
							aria-label="Copy zapstore URL"
						>
							{#if shareUrlCopied}
								<span class="check-icon">
									<Check
										variant="outline"
										size={14}
										strokeWidth={2.8}
										color="var(--blurpleLightColor)"
									/>
								</span>
							{:else}
								<Copy variant="outline" size={16} color="var(--white66)" />
							{/if}
						</button>
					</div>
				</div>
				{#if !canShare}
					<p class="am-share-hint" role="status">No event id available</p>
				{:else if shareFeedback}
					<p class="am-share-hint" role="status">{shareFeedback}</p>
				{/if}
			</div>
		{:else if subPanel === 'report'}
			<ReportModal
				bind:isOpen={reportEmbedOpen}
				embedWithoutModal={true}
				onEmbedDismiss={goMain}
				appName={targetApp?.name ?? ''}
				authorName={displayAuthorLabel}
				contentType={reportContentType}
				eventId={effectiveTargetEventId}
				authorPubkey={authorPubkey?.trim() ?? targetApp?.pubkey ?? ''}
				{searchProfiles}
				{searchEmojis}
			/>
		{/if}
	</div>
</Modal>

{#if canOpenCommentModal}
	<CommentModal
		bind:isOpen={commentModalOpen}
		target={targetApp}
		{contentType}
		{rootContext}
		{version}
		recipientName={recipientName || authorName}
		{otherZaps}
		{effectiveGetCurrentPubkey}
		{searchProfiles}
		{searchEmojis}
		signEvent={effectiveSignEvent}
		onsubmit={handleCommentModalSubmit}
		onzapReceived={onZapReceived}
		{onZapPending}
		{onZapPendingClear}
		instantOpen={commentReplaceOpen}
	/>
{/if}

{#if createStackOpen}
	<div
		class="new-stack-overlay"
		onclick={() => {
			createStackOpen = false;
		}}
		role="presentation"
	></div>

	<div class="new-stack-wrapper" role="dialog" aria-modal="true" aria-label="New stack">
		<div class="new-stack-sheet" transition:fly={{ y: 80, duration: 200, easing: cubicOut }}>
			{#if stackError}
				<div class="stack-error-message">{stackError}</div>
			{/if}
			<div class="stack-form-box">
				<input
					type="text"
					class="stack-name-input"
					placeholder="Stack Name"
					bind:value={stackName}
					bind:this={stackNameInput}
					disabled={stackSaving}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							stackDescInput?.focus();
						}
					}}
				/>
				<div class="stack-form-divider"></div>
				<textarea
					class="stack-description-input"
					placeholder="Add a description..."
					bind:value={stackDescription}
					bind:this={stackDescInput}
					rows="3"
					disabled={stackSaving}
				></textarea>
			</div>
			<div class="stack-button-row">
				<button
					type="button"
					class="save-stack-button"
					onclick={handleSaveStack}
					disabled={!stackName.trim() || stackSaving}
				>
					{stackSaving ? 'Creating...' : 'Create Stack'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(.actions-modal.modal-bottom .modal-content) {
		padding: 0;
	}

	:global(.actions-modal) {
		transition: transform 0.25s cubic-bezier(0.33, 1, 0.68, 1);
		transform-origin: top center;
	}

	:global(.actions-modal.actions-modal-child-open) {
		transform: scale(0.96) translateY(8px);
	}

	.am-inner {
		box-sizing: border-box;
		min-width: 0;
		padding: var(--comment-modal-inset);
		padding-bottom: var(--comment-modal-bottom-inset);
		display: flex;
		flex-direction: column;
		gap: 10px;
		position: relative;
	}

	.child-overlay {
		position: absolute;
		inset: 0;
		background: var(--black33);
		z-index: 10;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.2s ease-out;
		border-radius: inherit;
	}

	.child-overlay.visible {
		opacity: 1;
	}

	.am-subpanel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
		min-height: 120px;
	}

	.am-subpanel-body {
		min-width: 0;
	}

	.am-catalog-root-block {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		min-width: 0;
		width: 100%;
		gap: 0;
	}

	.am-comment-card {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		width: 100%;
		margin: 0;
		padding: 8px;
		text-align: left;
		cursor: pointer;
		border: 0.33px solid var(--white33);
		border-radius: var(--radius-16);
		background: var(--black33);
		box-sizing: border-box;
	}

	.am-comment-card:active {
		transform: scale(0.99);
	}

	.am-comment-card-quote {
		min-width: 0;
		padding-left: 4px;
		box-sizing: border-box;
	}

	.am-comment-card-footer {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: flex-start;
		gap: 10px;
		padding: 2px 4px 0 4px;
		margin-top: 0;
	}

	.am-comment-card--plain .am-comment-card-footer {
		padding: 2px 4px;
	}

	:global(.am-comment-card-icon) {
		flex-shrink: 0;
		padding-left: 4px;
		box-sizing: content-box;
	}

	.am-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}

	.am-comment-card-label {
		font-size: 14px;
		font-weight: 500;
		color: var(--white33);
	}

	@media (min-width: 768px) {
		.am-comment-card-label {
			font-size: 16px;
		}
	}

	.am-eyebrow {
		margin: 0;
		padding-left: 12px;
		align-self: stretch;
	}

	.am-actions-row {
		display: flex;
		flex-direction: row;
		gap: 12px;
		width: 100%;
	}

	.am-panel-icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
	}

	.am-panel-btn {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		gap: 10px;
		padding: 20px 8px 16px;
		margin: 0;
		border: none;
		border-radius: var(--radius-16);
		background: var(--black33);
		cursor: pointer;
		box-sizing: border-box;
	}

	.am-panel-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.am-panel-btn:not(:disabled):active {
		transform: scale(0.99);
	}

	.am-panel-label {
		font-size: 14px;
		font-weight: 500;
		color: var(--white);
		text-align: center;
	}

	@media (min-width: 768px) {
		.am-panel-label {
			font-size: 16px;
		}
	}

	.am-stacks-scroll-row {
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.am-stacks-scroll-row::-webkit-scrollbar {
		display: none;
	}

	.am-stacks-row-inner {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		gap: 10px;
		width: max-content;
	}

	.am-create-stack-empty,
	.am-create-stack-inline {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		background-color: var(--black33);
		border: none;
		border-radius: 16px;
		cursor: pointer;
		flex-shrink: 0;
	}

	.am-create-stack-empty {
		width: 100%;
		height: 100px;
		padding: 0 16px;
	}

	.am-create-stack-inline {
		flex-direction: column;
		width: 200px;
		height: 100px;
		padding: 0 12px;
		box-sizing: border-box;
	}

	.am-create-stack-empty span,
	.am-create-stack-inline span {
		font-size: 17px;
		font-weight: 500;
		color: var(--white16);
		line-height: 1;
	}

	@media (max-width: 767px) {
		.am-create-stack-empty,
		.am-create-stack-inline {
			height: 88px;
		}

		.am-create-stack-inline {
			width: 180px;
		}

		.am-create-stack-empty span,
		.am-create-stack-inline span {
			font-size: 16px;
		}

		:global(.am-stacks-loading-skeleton) {
			height: 88px !important;
		}
	}

	.am-share-panel {
		background: var(--black33);
		border-radius: var(--radius-16);
		overflow: hidden;
	}

	.am-share-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 8px 8px 14px;
	}

	.am-share-left {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 120px;
	}

	.am-share-label {
		font-size: 0.875rem;
		color: var(--white);
		white-space: nowrap;
	}

	.am-share-value {
		flex: 1;
		min-width: 0;
		font-size: 0.875rem;
		color: var(--white66);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-align: right;
	}

	.am-share-copy-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 8px;
		background: var(--white8);
		cursor: pointer;
		flex-shrink: 0;
		transition: transform 0.15s ease;
	}

	.am-share-copy-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.am-share-copy-btn:not(:disabled):hover {
		transform: scale(1.01);
	}

	.am-share-copy-btn:not(:disabled):active {
		transform: scale(0.97);
	}

	.am-share-divider {
		width: 100%;
		height: 1px;
		background-color: var(--white11);
	}

	.am-share-hint {
		margin: 8px 0 0 0;
		padding: 0 4px;
		font-size: 13px;
		color: var(--white33);
		text-align: center;
	}

	.am-report-btn {
		width: 100%;
		height: 42px;
		margin: 0;
		padding: 0 20px;
		font-size: 16px;
		font-weight: 500;
		color: var(--rougeColor);
		background: var(--black33);
		border: none;
		border-radius: var(--radius-16);
		cursor: pointer;
	}

	.am-report-btn:active {
		transform: scale(0.99);
	}

	@media (max-width: 767px) {
		.am-report-btn {
			height: 38px;
		}
	}

	.am-delete-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.am-delete-error {
		margin: 4px 0 0 0;
		padding: 0 4px;
		font-size: 13px;
		color: var(--rougeColor);
		text-align: center;
	}

	.details-modal-inner {
		padding: 8px 0 16px;
		max-height: min(70vh, 560px);
		overflow-y: auto;
		box-sizing: border-box;
	}

	.details-loading,
	.details-empty {
		margin: 16px 12px;
		font-size: 14px;
		color: var(--white33);
		text-align: center;
	}

	.am-label-panel {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.am-label-error {
		margin: 0;
		font-size: 13px;
		color: var(--rougeColor);
	}

	.labels-scroll-row {
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		padding: 4px 0;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.labels-scroll-row::-webkit-scrollbar {
		display: none;
	}

	.labels-row-inner {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		gap: 10px;
		width: max-content;
		padding: 0 4px;
	}

	.label-tap {
		margin: 0;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		flex-shrink: 0;
	}

	.label-tap:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.check-icon {
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

	.new-stack-overlay {
		position: fixed;
		inset: 0;
		z-index: 109;
		background: transparent;
	}

	.new-stack-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 110;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.new-stack-sheet {
		width: 100%;
		max-width: 100%;
		margin: 0;
		background: var(--gray66);
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid var(--white8);
		border-bottom: none;
		padding: 16px;
		pointer-events: auto;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	@media (min-width: 768px) {
		.new-stack-sheet {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid var(--white8);
			padding: 12px;
		}
	}

	.stack-error-message {
		padding: 12px 16px;
		background: color-mix(in srgb, var(--rougeColor) 10%, transparent);
		border: 0.33px solid color-mix(in srgb, var(--rougeColor) 40%, transparent);
		border-radius: var(--radius-12);
		color: var(--rougeColor);
		font-size: 14px;
	}

	.stack-form-box {
		display: flex;
		flex-direction: column;
		background-color: var(--black33);
		border: 0.33px solid var(--white33);
		border-radius: var(--radius-16);
		overflow: hidden;
	}

	.stack-name-input {
		width: 100%;
		padding: 10px 12px;
		background: transparent;
		border: none;
		outline: none;
		color: var(--white);
		font-family: 'Inter', sans-serif;
		font-size: 18px;
		font-weight: 600;
		box-sizing: border-box;
	}

	.stack-name-input::placeholder {
		color: var(--white33);
		font-weight: 500;
	}

	.stack-form-divider {
		width: 100%;
		height: 1px;
		background-color: var(--white8);
	}

	.stack-description-input {
		width: 100%;
		padding: 10px 12px;
		background: transparent;
		border: none;
		outline: none;
		color: var(--white);
		font-family: 'Inter', sans-serif;
		font-size: 16px;
		font-weight: 400;
		line-height: 1.5;
		resize: none;
		box-sizing: border-box;
		min-height: 80px;
	}

	.stack-description-input::placeholder {
		color: var(--white33);
	}

	.stack-button-row {
		display: flex;
		width: 100%;
	}

	.save-stack-button {
		flex: 1;
		height: 42px;
		padding: 0 20px;
		background: var(--gradient-blurple);
		border: none;
		border-radius: var(--radius-16);
		color: var(--whiteEnforced);
		font-size: 16px;
		font-weight: 500;
		cursor: pointer;
		transition:
			transform 0.15s ease,
			opacity 0.15s ease;
	}

	.save-stack-button:hover:not(:disabled) {
		transform: scale(1.02);
	}

	.save-stack-button:active:not(:disabled) {
		transform: scale(0.98);
	}

	.save-stack-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 767px) {
		.save-stack-button {
			height: 38px;
		}
	}
</style>
