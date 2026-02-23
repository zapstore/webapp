<script lang="js">
/**
 * ActionsModal - Actions sheet for content (add labels, add to stacks, report).
 * Opened from BottomBar when signed in. Content type (app, stack, etc.) drives report label.
 */
import { browser } from "$app/environment";
import Modal from "$lib/components/common/Modal.svelte";
import InputLabel from "$lib/components/common/InputLabel.svelte";
import AppSmallStackCard from "$lib/components/cards/AppSmallStackCard.svelte";
import SkeletonLoader from "$lib/components/common/SkeletonLoader.svelte";
import { Plus } from "$lib/components/icons";
import Label from "$lib/components/common/Label.svelte";
import { publishStack, queryEvents, parseAppStack, parseApp, liveQuery, updateStackApps } from "$lib/nostr";
import { signEvent, getIsSignedIn, getCurrentPubkey } from "$lib/stores/auth.svelte.js";
import { EVENT_KINDS } from "$lib/config.js";

let { 
	isOpen = $bindable(false), 
	contentType = "app", 
	targetApp = null
} = $props();

const contentTypeLabel = $derived(contentType.charAt(0).toUpperCase() + contentType.slice(1));
const isSignedIn = $derived(getIsSignedIn());
const currentPubkey = $derived(getCurrentPubkey());
let labelValue = $state("");

// Default label suggestions
const defaultLabels = ['Security', 'Privacy', 'Open Source', 'Productivity', 'Social', 'Developer'];

// User's stacks (fetched from Dexie) - includes raw event for updates
let userStacks = $state([]);
let stacksLoading = $state(false);
let stacksLoaded = $state(false);

// Track which stacks are being updated
let updatingStacks = $state(new Set());

// Step: "main" or "createStack"
let step = $state("main");
let stackName = $state("");
let stackDescription = $state("");
let saving = $state(false);
let error = $state("");

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
	
	console.log('[ActionsModal] Loading stacks for pubkey:', currentPubkey);
	stacksLoading = true;
	
	// Use liveQuery to reactively update when stacks change
	const subscription = liveQuery(() => 
		queryEvents({ kinds: [EVENT_KINDS.APP_STACK], authors: [currentPubkey] })
	).subscribe({
		next: async (stackEvents) => {
			console.log('[ActionsModal] Found stack events:', stackEvents.length, stackEvents);
			const parsedStacks = stackEvents.map(parseAppStack);
			console.log('[ActionsModal] Parsed stacks:', parsedStacks);
			
			// Resolve app details for each stack
			const allIds = new Set();
			for (const s of parsedStacks) {
				for (const ref of s.appRefs || []) {
					if (ref.kind === EVENT_KINDS.APP) allIds.add(ref.identifier);
				}
			}
			
			let appsByKey = new Map();
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
	
	updatingStacks = new Set([...updatingStacks, stack.id]);
	
	try {
		// Convert Svelte 5 Proxy objects to plain objects
		const plainEvent = JSON.parse(JSON.stringify(stack.event));
		const plainApp = { pubkey: targetApp.pubkey, dTag: targetApp.dTag };
		
		const result = await updateStackApps(plainEvent, plainApp, action, signEvent);
		console.log(`[ActionsModal] ${action === 'add' ? 'Added to' : 'Removed from'} stack:`, stack.name);
	} catch (err) {
		console.error('[ActionsModal] Failed:', err);
	} finally {
		updatingStacks = new Set([...updatingStacks].filter(id => id !== stack.id));
	}
}

function openCreateStack() {
	step = "createStack";
	error = "";
}

function goBack() {
	step = "main";
	stackName = "";
	stackDescription = "";
	error = "";
}

function selectLabel(label) {
	labelValue = label;
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
		console.log('[ActionsModal] Creating stack:', { name: stackName, description: stackDescription, apps, targetApp });
		const signed = await publishStack(stackName.trim(), stackDescription.trim(), apps, signEvent);
		console.log('[ActionsModal] Stack published:', signed);
		
		// Go back to main view (stacks will update via liveQuery)
		goBack();
	} catch (err) {
		console.error('Failed to create stack:', err);
		error = err instanceof Error ? err.message : 'Failed to create stack';
	} finally {
		saving = false;
	}
}

// Reset step when modal closes
$effect(() => {
	if (!isOpen) {
		step = "main";
		stackName = "";
		stackDescription = "";
		error = "";
		saving = false;
		updatingStacks = new Set();
	}
});
</script>

<Modal bind:open={isOpen} align="bottom" wide={true} ariaLabel="Content actions">
	<div class="actions-modal-content">
		{#if step === "main"}
			<!-- Title section -->
			<div class="actions-section title-section">
				<h2 class="modal-title-text">Actions</h2>
			</div>

			<div class="section-divider"></div>

			<!-- Stacks section -->
			<div class="actions-section">
				<p class="actions-modal-header">ADD TO STACKS</p>
				<div class="section-content">
					{#if stacksLoading}
						<div class="stacks-row">
							<SkeletonLoader width="140px" height="80px" borderRadius="12px" />
							<SkeletonLoader width="140px" height="80px" borderRadius="12px" />
						</div>
					{:else if stacksLoaded && userStacks.length === 0}
						<!-- No stacks: full-width New Stack button matching card height -->
						<button type="button" class="create-stack-button-empty" onclick={openCreateStack}>
							<Plus variant="outline" size={24} color="hsl(var(--white16))" strokeWidth={2} />
							<span>New Stack</span>
						</button>
					{:else}
						<!-- Has stacks: row with cards + New Stack button at end -->
						<div class="stacks-row">
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
					{/if}
				</div>
			</div>

			<div class="section-divider"></div>

			<!-- Labels section -->
			<div class="actions-section">
				<p class="actions-modal-header">ADD LABELS</p>
				<div class="section-content">
					<InputLabel bind:value={labelValue} placeholder="Your label" />
				</div>
				<div class="labels-scroll-row">
					<div class="labels-row-inner">
						{#each defaultLabels as label}
							<button
								type="button"
								class="label-tap"
								onclick={() => selectLabel(label)}
								aria-label="Select {label}"
							>
								<Label text={label} isSelected={labelValue === label} isEmphasized={false} />
							</button>
						{/each}
					</div>
				</div>
			</div>

			<div class="section-divider"></div>

			<!-- Report section -->
			<div class="actions-section">
				<div class="section-content">
					<button
						type="button"
						class="report-button"
						onclick={() => {}}
					>
						Report this {contentTypeLabel}
					</button>
				</div>
			</div>
		{:else if step === "createStack"}
			<!-- Title section for create stack -->
			<div class="actions-section title-section">
				<h2 class="modal-title-text">New Stack</h2>
			</div>

			<div class="create-stack-view">
				{#if error}
					<div class="error-message">{error}</div>
				{/if}
				<div class="stack-form-box">
					<input
						type="text"
						class="stack-name-input"
						placeholder="Stack Name"
						bind:value={stackName}
					/>
					<div class="stack-form-divider"></div>
					<textarea
						class="stack-description-input"
						placeholder="Add a description..."
						bind:value={stackDescription}
						rows="3"
					></textarea>
				</div>
				<div class="stack-button-row">
					<button type="button" class="back-button" onclick={goBack} disabled={saving}>
						Back
					</button>
					<button 
						type="button" 
						class="save-stack-button"
						onclick={handleSaveStack}
						disabled={!stackName.trim() || saving}
					>
						{saving ? 'Saving...' : 'Save Stack'}
					</button>
				</div>
			</div>
		{/if}
	</div>
</Modal>

<style>
	.actions-modal-content {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
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
		font-size: 2.25rem;
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

	.stacks-row {
		display: flex;
		align-items: center;
		gap: 10px;
		overflow-x: auto;
		overflow-y: visible;
		padding-bottom: 4px;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
	}

	.stacks-row::-webkit-scrollbar {
		display: none;
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
		padding: 4px 12px 8px 12px;
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

	/* Create Stack View */
	.create-stack-view {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 12px;
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
		padding: 12px 16px;
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
		padding: 12px 16px;
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
		gap: 12px;
		width: 100%;
	}

	.back-button {
		padding: 0 20px;
		height: 42px;
		background-color: hsl(var(--black33));
		border: none;
		border-radius: var(--radius-16);
		color: hsl(var(--white66));
		font-size: 16px;
		font-weight: 500;
		cursor: pointer;
		flex-shrink: 0;
	}

	.back-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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
		.back-button,
		.save-stack-button {
			height: 38px;
		}
	}
</style>
