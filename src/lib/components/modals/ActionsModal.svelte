<script lang="js">
/**
 * ActionsModal - Actions sheet for content (add labels, add to stacks, report).
 * Opened from BottomBar when signed in. Content type (app, stack, etc.) drives report label.
 */
import { fly } from "svelte/transition";
import { cubicOut } from "svelte/easing";
import { browser } from "$app/environment";
import Modal from "$lib/components/common/Modal.svelte";
import InputLabel from "$lib/components/common/InputLabel.svelte";
import AppSmallStackCard from "$lib/components/cards/AppSmallStackCard.svelte";
import SkeletonLoader from "$lib/components/common/SkeletonLoader.svelte";
import { Plus } from "$lib/components/icons";
import Label from "$lib/components/common/Label.svelte";
import { SvelteSet, SvelteMap } from "svelte/reactivity";
import {
	publishStack,
	publishAddressableLabel,
	publishForumPostLabel,
	publishLabelDeletion,
	publishDeletionRequest,
	queryEvents,
	parseAppStack,
	parseApp,
	liveQuery,
	updateStackApps
} from "$lib/nostr";
import { signEvent, getIsSignedIn, getCurrentPubkey } from "$lib/stores/auth.svelte.js";
import {
	EVENT_KINDS,
	FORUM_CATEGORIES,
	FORUM_RELAY,
	DEFAULT_SOCIAL_RELAYS,
	DEFAULT_CATALOG_RELAYS,
	ACTIONS_DELETABLE_CONTENT_LABELS
} from "$lib/config.js";
import { wheelScroll } from "$lib/actions/wheelScroll.js";

let { 
	isOpen = $bindable(false), 
	contentType = "app", 
	targetApp = null,
	onReport = () => {},
	onLabelPublished = () => {},
	/** After successful “delete your content” (kind 5); parent may navigate away */
	onOwnContentDeleted = () => {}
} = $props();

const contentTypeLabel = $derived(contentType.charAt(0).toUpperCase() + contentType.slice(1));
const actionsContentNoun = $derived(
	ACTIONS_DELETABLE_CONTENT_LABELS[contentType] ?? contentTypeLabel
);
const showStacksSection = $derived(contentType === 'app');
const isSignedIn = $derived(getIsSignedIn());
const currentPubkey = $derived(getCurrentPubkey());
const isContentAuthor = $derived(
	Boolean(
		currentPubkey &&
			targetApp?.pubkey &&
			String(currentPubkey).trim().toLowerCase() === String(targetApp.pubkey).trim().toLowerCase()
	)
);
let labelValue = $state("");
/** @type {'alternative' | 'reads' | 'writes' | null} */
let labelStructuredKind = $state(null);
let labelError = $state("");
let labelPublishing = $state(false);

/** Quick-add chips for apps/stacks (forum posts use `FORUM_CATEGORIES` — same as /community/forum). */
const DEFAULT_LABEL_CHIPS = ['Security', 'Privacy', 'Open Source', 'Productivity', 'Social', 'Developer'];

const labelChipSuggestions = $derived(
	contentType === 'forum' ? FORUM_CATEGORIES : DEFAULT_LABEL_CHIPS
);

/** User-published labels not in the default chip list — show first in the scroll row */
const userAddedLabelChips = $derived.by(() => {
	const sug = labelChipSuggestions;
	const isSuggested = (/** @type {string} */ k) => sug.includes(k);
	const seen = /** @type {Record<string, true>} */ ({});
	const out = /** @type {string[]} */ ([]);
	for (const k of userLabelEventIdsByText.keys()) {
		if (isSuggested(k) || seen[k]) continue;
		seen[k] = true;
		out.push(k);
	}
	for (const k of optimisticAddedLabels) {
		if (isSuggested(k) || seen[k]) continue;
		seen[k] = true;
		out.push(k);
	}
	return out.sort((a, b) => a.localeCompare(b));
});

const labelChipsRow = $derived([...userAddedLabelChips, ...labelChipSuggestions]);

/** @type {Map<string, string>} */
let userLabelEventIdsByText = $state(new Map());
let optimisticAddedLabels = $state(/** @type {Set<string>} */ (new Set()));
let deleteOwnContentInFlight = $state(false);
let contentActionError = $state('');

function normPk(pk) {
	return String(pk ?? '').trim().toLowerCase();
}

/** @param {any[]} events */
function buildUserLabelEventMap(events) {
	const map = new Map();
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

function labelSubscriptionFilter() {
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

$effect(() => {
	if (!browser || !isOpen || !currentPubkey) {
		userLabelEventIdsByText = new Map();
		return;
	}
	const filter = labelSubscriptionFilter();
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

// User's stacks (fetched from Dexie) - includes raw event for updates
let userStacks = $state([]);
let stacksLoading = $state(false);
let stacksLoaded = $state(false);

// Track which stacks are being updated
let updatingStacks = new SvelteSet();

let createStackOpen = $state(false);
let stackName = $state("");
let stackDescription = $state("");
let saving = $state(false);
let error = $state("");
/** @type {HTMLInputElement | null} */
let stackNameInput = $state(null);
/** @type {HTMLTextAreaElement | null} */
let stackDescInput = $state(null);

$effect(() => {
	if (createStackOpen) {
		const t = globalThis.setTimeout(() => stackNameInput?.focus(), 80);
		return () => globalThis.clearTimeout(t);
	}
});

// Check if target app is in a stack
function stackContainsApp(stack) {
	if (!targetApp?.pubkey || !targetApp?.dTag) return false;
	const appATag = `${EVENT_KINDS.APP}:${targetApp.pubkey}:${targetApp.dTag}`;
	return stack.event?.tags?.some(t => t[0] === 'a' && t[1] === appATag) ?? false;
}

// Fetch user stacks when modal opens and user is signed in
$effect(() => {
	if (!browser || !isOpen || !currentPubkey) {
		userStacks = [];
		stacksLoaded = false;
		return;
	}
	
	stacksLoading = true;
	
	// Use liveQuery to reactively update when stacks change
	const subscription = liveQuery(() => 
		queryEvents({ kinds: [EVENT_KINDS.APP_STACK], authors: [currentPubkey] })
	).subscribe({
		next: async (stackEvents) => {
			const parsedStacks = stackEvents.map(parseAppStack);
			
			// Resolve app details for each stack
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
			
			// Build resolved stacks with app details AND keep the raw event
			userStacks = parsedStacks.map((stack, index) => ({
				id: stack.id,
				name: stack.title,
				event: stackEvents[index], // Keep raw event for updates
				apps: (stack.appRefs || [])
					.filter(ref => ref.kind === EVENT_KINDS.APP)
					.map(ref => {
						const app = appsByKey.get(`${ref.pubkey}:${ref.identifier}`);
						return app ? { icon: app.icon, name: app.name, dTag: app.dTag } : null;
					})
					.filter(Boolean)
			}));
			
			stacksLoading = false;
			stacksLoaded = true;
		},
		error: (err) => {
			console.error('Failed to load user stacks:', err);
			stacksLoading = false;
			stacksLoaded = true;
		}
	});
	
	return () => subscription.unsubscribe();
});

async function handleStackClick(stack) {
	if (!targetApp?.pubkey || !targetApp?.dTag) {
		console.error('[ActionsModal] Missing targetApp pubkey/dTag');
		return;
	}
	if (!stack.event) {
		console.error('[ActionsModal] Missing stack.event');
		return;
	}
	if (updatingStacks.has(stack.id)) {
		return;
	}
	
	const hasApp = stackContainsApp(stack);
	const action = hasApp ? 'remove' : 'add';
	
	updatingStacks.add(stack.id);
	
	try {
		// Convert Svelte 5 Proxy objects to plain objects
		const plainEvent = JSON.parse(JSON.stringify(stack.event));
		const plainApp = { pubkey: targetApp.pubkey, dTag: targetApp.dTag };
		
		await updateStackApps(plainEvent, plainApp, action, signEvent);
	} catch (err) {
		console.error('[ActionsModal] Failed:', err);
	} finally {
		updatingStacks.delete(stack.id);
	}
}

function openCreateStack() {
	createStackOpen = true;
	error = "";
}

function assertLabelTarget() {
	if (contentType === "forum") {
		if (!targetApp?.id?.trim() || !targetApp?.communityPubkey?.trim()) {
			labelError = "Nothing to attach this label to";
			return false;
		}
	} else if (!targetApp?.pubkey || !targetApp?.dTag) {
		labelError = "Nothing to attach this label to";
		return false;
	}
	return true;
}

async function toggleChipLabel(/** @type {string} */ label) {
	if (labelPublishing) return;
	if (!getIsSignedIn()) {
		labelError = "Please sign in to add a label";
		return;
	}
	if (!assertLabelTarget()) return;

	const applied = chipLabelIsSelected(label);
	const existingEventId = userLabelEventIdsByText.get(label);

	if (applied) {
		if (!existingEventId) return;
		labelError = "";
		labelPublishing = true;
		try {
			await publishLabelDeletion(signEvent, existingEventId, DEFAULT_SOCIAL_RELAYS);
			onLabelPublished();
		} catch (err) {
			labelError = err instanceof Error ? err.message : "Failed to remove label";
		} finally {
			labelPublishing = false;
		}
		return;
	}

	labelError = "";
	labelPublishing = true;
	optimisticAddedLabels = new Set(optimisticAddedLabels).add(label);
	try {
		if (contentType === "forum") {
			await publishForumPostLabel(signEvent, {
				eventId: targetApp.id,
				communityPubkey: targetApp.communityPubkey,
				labelValue: label
			});
		} else {
			await publishAddressableLabel(signEvent, {
				pubkey: targetApp.pubkey,
				identifier: targetApp.dTag,
				contentType,
				labelValue: label
			});
		}
		onLabelPublished();
	} catch (err) {
		labelError = err instanceof Error ? err.message : "Failed to publish label";
		const next = new Set(optimisticAddedLabels);
		next.delete(label);
		optimisticAddedLabels = next;
	} finally {
		const next = new Set(optimisticAddedLabels);
		next.delete(label);
		optimisticAddedLabels = next;
		labelPublishing = false;
	}
}

async function handlePublishLabel() {
	const body = labelValue.trim();
	if (!body) return;
	if (!getIsSignedIn()) {
		labelError = "Please sign in to add a label";
		return;
	}
	if (!assertLabelTarget()) return;

	const labelPayload = labelStructuredKind ? `${labelStructuredKind}:${body}` : body;
	const existingEventId = userLabelEventIdsByText.get(labelPayload);
	const applied = chipLabelIsSelected(labelPayload);

	if (applied && existingEventId) {
		labelError = "";
		labelPublishing = true;
		try {
			await publishLabelDeletion(signEvent, existingEventId, DEFAULT_SOCIAL_RELAYS);
			labelValue = "";
			labelStructuredKind = null;
			onLabelPublished();
		} catch (err) {
			labelError = err instanceof Error ? err.message : "Failed to remove label";
		} finally {
			labelPublishing = false;
		}
		return;
	}

	labelError = "";
	labelPublishing = true;
	optimisticAddedLabels = new Set(optimisticAddedLabels).add(labelPayload);
	try {
		if (contentType === "forum") {
			await publishForumPostLabel(signEvent, {
				eventId: targetApp.id,
				communityPubkey: targetApp.communityPubkey,
				labelValue: labelPayload
			});
		} else {
			await publishAddressableLabel(signEvent, {
				pubkey: targetApp.pubkey,
				identifier: targetApp.dTag,
				contentType,
				labelValue: labelPayload
			});
		}
		labelValue = "";
		labelStructuredKind = null;
		onLabelPublished();
	} catch (err) {
		labelError = err instanceof Error ? err.message : "Failed to publish label";
		const next = new Set(optimisticAddedLabels);
		next.delete(labelPayload);
		optimisticAddedLabels = next;
	} finally {
		const next = new Set(optimisticAddedLabels);
		next.delete(labelPayload);
		optimisticAddedLabels = next;
		labelPublishing = false;
	}
}

async function handleDeleteOwnContent() {
	if (!isContentAuthor || !targetApp || deleteOwnContentInFlight) return;
	if (!globalThis.confirm(`Delete your ${actionsContentNoun}? This cannot be undone.`)) return;
	contentActionError = "";
	deleteOwnContentInFlight = true;
	try {
		if (contentType === "forum") {
			await publishDeletionRequest(signEvent, {
				eventId: targetApp.id,
				eventKind: EVENT_KINDS.FORUM_POST,
				relays: [...new Set([...DEFAULT_SOCIAL_RELAYS, FORUM_RELAY])]
			});
		} else if (contentType === "app") {
			const appEvId = String(targetApp.ownContentEventId ?? targetApp.id ?? "").trim();
			await publishDeletionRequest(signEvent, {
				eventId: appEvId,
				eventKind: EVENT_KINDS.APP,
				aTagValue: `${EVENT_KINDS.APP}:${normPk(targetApp.pubkey)}:${String(targetApp.dTag).trim()}`,
				relays: DEFAULT_CATALOG_RELAYS
			});
		} else if (contentType === "stack") {
			await publishDeletionRequest(signEvent, {
				eventId: targetApp.id,
				eventKind: EVENT_KINDS.APP_STACK,
				aTagValue: `${EVENT_KINDS.APP_STACK}:${normPk(targetApp.pubkey)}:${String(targetApp.dTag).trim()}`,
				relays: DEFAULT_CATALOG_RELAYS
			});
		} else {
			return;
		}
		isOpen = false;
		onOwnContentDeleted();
	} catch (err) {
		contentActionError = err instanceof Error ? err.message : "Failed to delete";
	} finally {
		deleteOwnContentInFlight = false;
	}
}

async function handleSaveStack() {
	if (!stackName.trim() || saving) return;
	if (!isSignedIn) {
		error = "Please sign in to create a stack";
		return;
	}
	
	saving = true;
	error = "";
	
	try {
		const apps = targetApp ? [targetApp] : [];
		await publishStack(stackName.trim(), stackDescription.trim(), apps, signEvent);
		
		// Close overlay; stacks update via liveQuery
		createStackOpen = false;
		stackName = "";
		stackDescription = "";
	} catch (err) {
		console.error('Failed to create stack:', err);
		error = err instanceof Error ? err.message : 'Failed to create stack';
	} finally {
		saving = false;
	}
}

// Reset when modal closes
$effect(() => {
	if (!isOpen) {
		createStackOpen = false;
		stackName = "";
		stackDescription = "";
		error = "";
		saving = false;
		updatingStacks = new SvelteSet();
		labelValue = "";
		labelStructuredKind = null;
		labelError = "";
		labelPublishing = false;
		contentActionError = "";
		optimisticAddedLabels = new Set();
		userLabelEventIdsByText = new Map();
	}
});
</script>

<Modal bind:open={isOpen} align="bottom" wide={true} ariaLabel="Content actions" class="actions-modal {createStackOpen ? 'actions-modal-child-open' : ''}">
	<div class="actions-modal-content">
		<div class="child-overlay" class:visible={createStackOpen} aria-hidden="true"></div>
		<!-- Title section -->
		<div class="actions-section title-section">
			<h2 class="modal-title-text">Actions</h2>
		</div>

			<div class="section-divider"></div>

			<!-- Stacks section (apps only) -->
			{#if showStacksSection}
			<div class="actions-section">
				<p class="actions-modal-header">ADD TO STACKS</p>
				{#if stacksLoading}
					<div class="stacks-scroll-row" use:wheelScroll>
						<div class="stacks-row-inner">
							<SkeletonLoader width="140px" height="80px" borderRadius="12px" />
							<SkeletonLoader width="140px" height="80px" borderRadius="12px" />
						</div>
					</div>
				{:else if stacksLoaded && userStacks.length === 0}
					<div class="section-content">
						<button type="button" class="create-stack-button-empty" onclick={openCreateStack}>
							<Plus variant="outline" size={24} color="hsl(var(--white16))" strokeWidth={2} />
							<span>New Stack</span>
						</button>
					</div>
				{:else}
					<div class="stacks-scroll-row" use:wheelScroll>
						<div class="stacks-row-inner">
							{#each userStacks as stack (stack.id)}
								<AppSmallStackCard 
									{stack} 
									hasApp={stackContainsApp(stack)}
									loading={updatingStacks.has(stack.id)}
									onclick={() => handleStackClick(stack)}
								/>
							{/each}
							<button type="button" class="create-stack-button-inline" onclick={openCreateStack}>
								<Plus variant="outline" size={24} color="hsl(var(--white16))" strokeWidth={2} />
								<span>New Stack</span>
							</button>
						</div>
					</div>
				{/if}
			</div>

			<div class="section-divider"></div>
			{/if}

			<!-- Labels section -->
			<div class="actions-section">
				<p class="actions-modal-header">ADD LABELS</p>
				<div class="section-content">
					<InputLabel
						bind:value={labelValue}
						bind:structuredKind={labelStructuredKind}
						enableStructuredModes={contentType === 'app'}
						placeholder="Your label"
						onAdd={handlePublishLabel}
						addDisabled={labelPublishing}
					/>
					{#if labelError}
						<p class="label-error" role="alert">{labelError}</p>
					{/if}
				</div>
				<div class="labels-scroll-row" use:wheelScroll>
					<div class="labels-row-inner">
						{#each labelChipsRow as label (label)}
							<button
								type="button"
								class="label-tap"
								onclick={() => toggleChipLabel(label)}
								disabled={labelPublishing}
								aria-label={chipLabelIsSelected(label) ? `Remove label ${label}` : `Add label ${label}`}
							>
								<Label text={label} isSelected={chipLabelIsSelected(label)} isEmphasized={false} />
							</button>
						{/each}
					</div>
				</div>
			</div>

			<div class="section-divider"></div>

			<!-- Report / delete own content -->
			<div class="actions-section">
				<div class="section-content">
					{#if contentActionError}
						<p class="label-error" role="alert">{contentActionError}</p>
					{/if}
					{#if isContentAuthor && (contentType === 'app' || contentType === 'stack' || contentType === 'forum')}
						<button
							type="button"
							class="report-button"
							disabled={deleteOwnContentInFlight}
							onclick={handleDeleteOwnContent}
						>
							{deleteOwnContentInFlight ? 'Deleting…' : `Delete your ${actionsContentNoun}`}
						</button>
					{:else}
						<button
							type="button"
							class="report-button"
							onclick={() => { isOpen = false; onReport(); }}
						>
							Report this {actionsContentNoun}
						</button>
					{/if}
				</div>
			</div>
	</div>
</Modal>

{#if createStackOpen}
	<div class="new-stack-overlay" onclick={() => { createStackOpen = false; }} role="presentation"></div>

	<div class="new-stack-wrapper" role="dialog" aria-modal="true" aria-label="New stack">
		<div class="new-stack-sheet" transition:fly={{ y: 80, duration: 200, easing: cubicOut }}>
			{#if error}
				<div class="error-message">{error}</div>
			{/if}
			<div class="stack-form-box">
				<input
					type="text"
					class="stack-name-input"
					placeholder="Stack Name"
					bind:value={stackName}
					bind:this={stackNameInput}
					disabled={saving}
					onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); stackDescInput?.focus(); } }}
				/>
				<div class="stack-form-divider"></div>
				<textarea
					class="stack-description-input"
					placeholder="Add a description..."
					bind:value={stackDescription}
					bind:this={stackDescInput}
					rows="3"
					disabled={saving}
				></textarea>
			</div>
			<div class="stack-button-row">
				<button
					type="button"
					class="save-stack-button"
					onclick={handleSaveStack}
					disabled={!stackName.trim() || saving}
				>
					{saving ? 'Creating...' : 'Create Stack'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Scale + darken ActionsModal when NewStack overlay is open */
	:global(.actions-modal) {
		transition: transform 0.25s cubic-bezier(0.33, 1, 0.68, 1);
		transform-origin: top center;
	}
	:global(.actions-modal.actions-modal-child-open) {
		transform: scale(0.96) translateY(8px);
	}

	.actions-modal-content {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		position: relative;
	}

	/* Dark tint that fades over the modal content when overlay is open */
	.child-overlay {
		position: absolute;
		inset: 0;
		background: hsl(var(--black33));
		z-index: 10;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.2s ease-out;
		border-radius: inherit;
	}
	.child-overlay.visible {
		opacity: 1;
	}

	/* New Stack overlay sheet */
	.new-stack-overlay {
		position: fixed;
		inset: 0;
		z-index: 59;
		background: transparent;
	}

	.new-stack-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 60;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.new-stack-sheet {
		width: 100%;
		max-width: 100%;
		margin: 0;
		background: hsl(var(--gray66));
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid hsl(var(--white8));
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
			border-bottom: 0.33px solid hsl(var(--white8));
			padding: 12px;
		}
	}

	.actions-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 0;
	}

	.title-section {
		padding-top: 24px;
		padding-bottom: 16px;
	}

	.modal-title-text {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		text-align: center;
	}

	.section-divider {
		width: 100%;
		height: 1px;
		background-color: hsl(var(--white8));
	}

	.actions-modal-header {
		margin: 0;
		padding-left: 24px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: hsl(var(--white33));
	}

	.section-content {
		padding: 0 12px;
	}

	/* Match `.labels-scroll-row` + `.labels-row-inner`: full-width scroll strip with 12px inset, no double padding clip */
	.stacks-scroll-row {
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		padding: 0 12px;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.stacks-scroll-row::-webkit-scrollbar {
		display: none;
	}

	.stacks-row-inner {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		gap: 10px;
		width: max-content;
	}

	.label-error {
		margin: 8px 0 0 0;
		font-size: 13px;
		color: hsl(var(--destructive));
	}

	/* Full-width button when no stacks (same height as cards) */
	.create-stack-button-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 100%;
		height: 100px;
		padding: 0 16px;
		background-color: hsl(var(--black33));
		border: none;
		border-radius: 16px;
		cursor: pointer;
		overflow: visible;
	}

	.create-stack-button-empty span {
		font-size: 17px;
		font-weight: 500;
		color: hsl(var(--white16));
	}

	@media (max-width: 767px) {
		.create-stack-button-empty {
			height: 88px;
		}

		.create-stack-button-empty span {
			font-size: 16px;
		}
	}

	/* Inline button at end of row */
	.create-stack-button-inline {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 200px;
		height: 100px;
		padding: 0 12px;
		background-color: hsl(var(--black33));
		border: none;
		border-radius: 16px;
		cursor: pointer;
		flex-shrink: 0;
		box-sizing: border-box;
		align-self: center;
		overflow: visible;
	}

	.create-stack-button-inline span {
		font-size: 17px;
		font-weight: 500;
		color: hsl(var(--white16));
		line-height: 1;
	}

	@media (max-width: 767px) {
		.create-stack-button-inline {
			width: 180px;
			height: 88px;
		}

		.create-stack-button-inline span {
			font-size: 16px;
		}
	}

	/* Labels row: simple horizontal scroll only */
	.labels-scroll-row {
		overflow-x: auto;
		overflow-y: hidden;
		padding: 4px 12px;
		-webkit-overflow-scrolling: touch;
	}

	.labels-scroll-row::-webkit-scrollbar {
		display: none;
	}

	.labels-scroll-row {
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.labels-row-inner {
		display: flex;
		flex-wrap: nowrap;
		gap: 8px;
		width: max-content;
	}

	.label-tap {
		flex-shrink: 0;
		cursor: pointer;
		background: transparent;
		border: none;
		padding: 0;
	}

	.label-tap:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.report-button {
		width: 100%;
		height: 42px;
		padding: 0 20px;
		font-size: 16px;
		font-weight: 500;
		color: hsl(var(--destructive));
		background-color: hsl(var(--black33));
		border: none;
		border-radius: var(--radius-16);
		cursor: pointer;
	}
	@media (max-width: 767px) {
		.report-button {
			height: 38px;
		}
	}

	.error-message {
		padding: 12px 16px;
		background: hsl(var(--destructive) / 0.1);
		border: 0.33px solid hsl(var(--destructive) / 0.4);
		border-radius: var(--radius-12);
		color: hsl(var(--destructive));
		font-size: 14px;
	}

	.stack-form-box {
		display: flex;
		flex-direction: column;
		background-color: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white33));
		border-radius: var(--radius-16);
		overflow: hidden;
	}

	.stack-name-input {
		width: 100%;
		padding: 10px 12px;
		background: transparent;
		border: none;
		outline: none;
		color: hsl(var(--white));
		font-family: "Inter", sans-serif;
		font-size: 18px;
		font-weight: 600;
		box-sizing: border-box;
	}

	.stack-name-input::placeholder {
		color: hsl(var(--white33));
		font-weight: 500;
	}

	.stack-form-divider {
		width: 100%;
		height: 1.4px;
		background-color: hsl(var(--white8));
	}

	.stack-description-input {
		width: 100%;
		padding: 10px 12px;
		background: transparent;
		border: none;
		outline: none;
		color: hsl(var(--white));
		font-family: "Inter", sans-serif;
		font-size: 16px;
		font-weight: 400;
		line-height: 1.5;
		resize: none;
		box-sizing: border-box;
		min-height: 80px;
	}

	.stack-description-input::placeholder {
		color: hsl(var(--white33));
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
		color: hsl(var(--primary-foreground));
		font-size: 16px;
		font-weight: 500;
		cursor: pointer;
		transition: transform 0.15s ease, opacity 0.15s ease;
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
