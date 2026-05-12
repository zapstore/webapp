<script lang="js">
	/**
	 * StudioStackEdit — Full-panel edit screen for stack metadata and apps.
	 *
	 * Labels are `t` tags stored in the stack event, edited locally and
	 * saved together with name/description via the main Save button.
	 * Same pattern as StudioAppEdit (no immediate relay publishing).
	 */
	import BackButton from '$lib/components/common/BackButton.svelte';
	import AppPic from '$lib/components/common/AppPic.svelte';
	import Modal from '$lib/components/common/Modal.svelte';
	import InputLabel from '$lib/components/common/InputLabel.svelte';
	import Label from '$lib/components/common/Label.svelte';
	import { X } from 'lucide-svelte';
	import { updateStack, deleteStack } from '$lib/nostr';
	import { encodeStackNaddr } from '$lib/nostr/models.js';
	import { signEvent } from '$lib/stores/auth.svelte.js';

	let {
		stack = null,
		apps = [],
		appsLoading = false,
		onBack = () => {},
		onSaved = (_updated) => {},
		onDeleted = () => {}
	} = $props();

	// ── Local edit state ───────────────────────────────────────────────────────
	let editName = $state('');
	let editDescription = $state('');
	// eslint-disable-next-line svelte/prefer-writable-derived -- user-mutable (removeApp mutates it)
	let editApps = $state([]);

	let saving = $state(false);
	let saveError = $state('');

	// ── Delete state ───────────────────────────────────────────────────────────
	let confirmingDelete = $state(false);
	let deleting = $state(false);
	let deleteError = $state('');

	// ── Labels (t tags, saved with main Save) ──────────────────────────────────
	const DEFAULT_LABEL_CHIPS = [
		'Security',
		'Privacy',
		'Open Source',
		'Productivity',
		'Social',
		'Developer'
	];
	let editLabels = $state(/** @type {string[]} */ ([]));
	let labelValue = $state('');

	const labelChipsRow = $derived.by(() => {
		const appliedSet = new Set(editLabels);
		const unapplied = DEFAULT_LABEL_CHIPS.filter((k) => !appliedSet.has(k));
		return [...editLabels, ...unapplied];
	});

	function chipLabelIsSelected(label) {
		return editLabels.includes(label);
	}

	function toggleChipLabel(label) {
		if (editLabels.includes(label)) {
			editLabels = editLabels.filter((l) => l !== label);
		} else {
			editLabels = [...editLabels, label];
		}
	}

	function handleAddLabel() {
		const body = labelValue.trim();
		if (!body) return;
		if (!editLabels.includes(body)) {
			editLabels = [...editLabels, body];
		}
		labelValue = '';
	}

	// ── Init form fields when stack identity changes ───────────────────────────
	// NOTE: must NOT read `apps` here — apps load async and would re-trigger this
	// effect, silently resetting any name/description the user has already typed.
	$effect(() => {
		if (!stack) return;
		editName = stack.title || '';
		editDescription = stack.description || '';
		editLabels = (stack.event?.tags ?? []).filter((t) => t[0] === 't' && t[1]).map((t) => t[1]);
		saveError = '';
		confirmingDelete = false;
		deleting = false;
		deleteError = '';
	});

	// ── Sync apps list separately so it never resets name/description ─────────
	$effect(() => {
		editApps = [...apps];
	});

	function removeApp(appToRemove) {
		editApps = editApps.filter(
			(a) => !(a.pubkey === appToRemove.pubkey && a.dTag === appToRemove.dTag)
		);
	}

	// ── Save ───────────────────────────────────────────────────────────────────
	async function handleSave() {
		if (saving || !stack) return;
		if (!editName.trim()) {
			saveError = 'Stack name is required.';
			return;
		}
		saving = true;
		saveError = '';
		try {
			const plainEvent = stack.event ? JSON.parse(JSON.stringify(stack.event)) : null;
			if (!plainEvent) throw new Error('Stack event not found');

			const result = await updateStack(
				plainEvent,
				editName.trim(),
				editDescription.trim(),
				editApps,
				editLabels,
				signEvent
			);
			onSaved(result);
		} catch (err) {
			console.error('[StudioStackEdit] save failed:', err);
			saveError = err?.message ?? 'Failed to save. Please try again.';
		} finally {
			saving = false;
		}
	}

	// ── Delete ─────────────────────────────────────────────────────────────────
	function openDeleteConfirm() {
		if (deleting || saving) return;
		deleteError = '';
		confirmingDelete = true;
	}

	function cancelDeleteConfirm() {
		if (deleting) return;
		confirmingDelete = false;
	}

	async function handleConfirmDelete() {
		if (deleting || !stack) return;
		const plainEvent = stack.event ? JSON.parse(JSON.stringify(stack.event)) : null;
		if (!plainEvent) {
			deleteError = 'Cannot delete — stack data is incomplete. Reload Studio and try again.';
			return;
		}
		deleting = true;
		deleteError = '';
		try {
			await deleteStack(plainEvent, signEvent);
			confirmingDelete = false;
			onDeleted();
		} catch (err) {
			console.error('[StudioStackEdit] delete failed:', err);
			deleteError = err?.message ?? 'Failed to delete. Please try again.';
		} finally {
			deleting = false;
		}
	}
</script>

{#if stack}
	<div class="edit-wrap">
		<!-- ── Sticky top bar ───────────────────────────────────────────────── -->
		<div class="edit-topbar">
			<BackButton {onBack} />
			<span class="edit-topbar-title">Edit Your Stack</span>
			<div class="topbar-actions">
				{#if stack?.pubkey && stack?.dTag}
					<a
						class="btn-secondary-xs btn-secondary-light topbar-view-btn"
						href="/stacks/{encodeStackNaddr(stack.pubkey, stack.dTag)}"
					>
						View
					</a>
				{/if}
				<button
					type="button"
					class="btn-primary-small edit-save-btn"
					onclick={handleSave}
					disabled={saving}
				>
					{saving ? 'Saving…' : 'Save'}
				</button>
			</div>
		</div>

		<div class="edit-body">
			<!-- ── GENERAL ──────────────────────────────────────────────────── -->
			<section class="edit-section">
				<span class="eyebrow-label section-eyebrow">General</span>

				<div class="form-box">
					<input
						type="text"
						class="form-input form-input--name"
						bind:value={editName}
						placeholder="Stack name"
						maxlength="80"
						autocomplete="off"
					/>
					<div class="form-divider"></div>
					<textarea
						class="form-input form-textarea"
						bind:value={editDescription}
						placeholder="Short description"
						rows="3"
						autocomplete="off"
					></textarea>
				</div>

				{#if saveError}
					<p class="save-error">{saveError}</p>
				{/if}
			</section>

			<!-- ── Full-width divider ────────────────────────────────────────── -->
			<div class="full-divider" aria-hidden="true"></div>

			<!-- ── APPS ─────────────────────────────────────────────────────── -->
			<section class="edit-section">
				<span class="eyebrow-label section-eyebrow">Apps</span>

				{#if appsLoading}
					<div class="apps-skeleton">
						<div class="skeleton-row"></div>
						<div class="skeleton-row"></div>
						<div class="skeleton-row"></div>
					</div>
				{:else if editApps.length > 0}
					<div class="apps-list">
						{#each editApps as app (app.pubkey + ':' + app.dTag)}
							<div class="app-row">
								<div class="app-info">
									<AppPic iconUrl={app.icon} name={app.name} identifier={app.dTag} size="sm" />
									<span class="app-name">{app.name}</span>
								</div>
								<button
									type="button"
									class="remove-app-btn"
									onclick={() => removeApp(app)}
									aria-label="Remove {app.name} from stack"
								>
									<X size={18} strokeWidth={2} />
								</button>
							</div>
						{/each}
					</div>
				{:else}
					<div class="empty-apps">
						<p class="regular14">No apps in this stack yet.</p>
					</div>
				{/if}
			</section>

			<!-- ── Full-width divider ────────────────────────────────────────── -->
			<div class="full-divider" aria-hidden="true"></div>

			<!-- ── LABELS ────────────────────────────────────────────────────── -->
			<section class="edit-section">
				<span class="eyebrow-label section-eyebrow">Labels</span>
				<div class="labels-input-wrap">
					<InputLabel
						bind:value={labelValue}
						enableStructuredModes={false}
						placeholder="Your label"
						onAdd={handleAddLabel}
						bgColor="var(--gray33)"
					/>
				</div>
				<div class="labels-wrap-row">
					{#each labelChipsRow as label (label)}
						<button
							type="button"
							class="label-tap"
							onclick={() => toggleChipLabel(label)}
							aria-label={chipLabelIsSelected(label)
								? `Remove label ${label}`
								: `Add label ${label}`}
						>
							<Label text={label} isSelected={chipLabelIsSelected(label)} isEmphasized={false} />
						</button>
					{/each}
				</div>
			</section>

			<!-- ── Full-width divider ────────────────────────────────────────── -->
			<div class="full-divider" aria-hidden="true"></div>

			<!-- ── DANGER ZONE ─────────────────────────────────────────────── -->
			<section class="edit-section danger-section">
				<span class="eyebrow-label section-eyebrow">Danger zone</span>

				<button
					type="button"
					class="btn-danger"
					onclick={openDeleteConfirm}
					disabled={deleting || saving}
				>
					{deleting ? 'Deleting…' : 'Delete this Stack'}
				</button>

				{#if deleteError && !confirmingDelete}
					<p class="save-error">{deleteError}</p>
				{/if}
			</section>

			<div class="full-divider" aria-hidden="true"></div>
		</div>
	</div>

	<Modal
		bind:open={confirmingDelete}
		align="center"
		ariaLabel="Confirm stack deletion"
		title="Delete stack"
		description="This publishes a NIP-09 deletion request for the stack. Clients that honor it will remove it. This cannot be undone."
		closeOnBackdropClick={!deleting}
		closeOnEscape={!deleting}
	>
		<div class="confirm-body">
			{#if deleteError}
				<p class="confirm-error">{deleteError}</p>
			{/if}
			<div class="confirm-actions">
				<button
					type="button"
					class="btn-secondary-large btn-secondary-modal confirm-cancel"
					onclick={cancelDeleteConfirm}
					disabled={deleting}
				>
					Cancel
				</button>
				<button
					type="button"
					class="btn-danger btn-danger-large"
					onclick={handleConfirmDelete}
					disabled={deleting}
				>
					{deleting ? 'Deleting…' : 'Delete'}
				</button>
			</div>
		</div>
	</Modal>
{/if}

<style>
	/* ── Outer wrapper ── */
	.edit-wrap {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		overflow: hidden;
	}

	/* ── Top bar ── */
	.edit-topbar {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-bottom: 1.4px solid var(--white11);
	}

	@media (min-width: 768px) {
		.edit-topbar {
			padding: 10px 16px;
		}
	}

	.edit-topbar-title {
		flex: 1;
		font-size: 15px;
		font-weight: 500;
		color: var(--white);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.edit-save-btn {
		flex-shrink: 0;
	}

	.topbar-actions {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-shrink: 0;
	}

	.topbar-view-btn {
		text-decoration: none;
		color: var(--white66);
	}

	/* ── Body ── */
	.edit-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	/* ── Sections ── */
	.edit-section {
		padding: 9px 12px 12px;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	@media (min-width: 768px) {
		.edit-section {
			padding: 12px 16px 16px;
		}
	}

	.section-eyebrow {
		color: var(--white33);
	}

	/* ── Full-width divider ── */
	.full-divider {
		width: 100%;
		height: 1.4px;
		background: var(--white11);
		flex-shrink: 0;
	}

	/* ── Form box ── */
	.form-box {
		margin-top: 12px;
		display: flex;
		flex-direction: column;
		background: var(--gray33);
		border: 0.33px solid var(--white33);
		border-radius: 16px;
		overflow: hidden;
	}

	.form-input {
		width: 100%;
		padding: 10px 14px;
		background: transparent;
		border: none;
		outline: none;
		color: var(--white);
		font-family: 'Inter', sans-serif;
		line-height: 1.4;
		resize: none;
		box-sizing: border-box;
	}

	.form-input::placeholder {
		color: var(--white33);
	}

	.form-input--name {
		font-size: 18px;
		font-weight: 600;
	}

	.form-input--name::placeholder {
		font-weight: 500;
	}

	.form-textarea {
		font-size: 14px;
		font-weight: 400;
		min-height: 72px;
		display: block;
		overflow-y: auto;
	}

	.form-divider {
		width: 100%;
		height: 1.4px;
		background: var(--white8);
		flex-shrink: 0;
	}

	/* ── Apps list ── */
	.apps-list {
		margin-top: 12px;
		display: flex;
		flex-direction: column;
		background: var(--gray33);
		border-radius: 16px;
		overflow: hidden;
	}

	.app-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 12px;
		border-bottom: 1px solid var(--white8);
	}

	.app-row:last-child {
		border-bottom: none;
	}

	.app-info {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		flex: 1;
	}

	.app-name {
		font-size: 15px;
		font-weight: 500;
		color: var(--white);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.remove-app-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 8px;
		color: var(--white33);
		cursor: pointer;
		transition:
			color 0.15s ease,
			background-color 0.15s ease;
		flex-shrink: 0;
	}

	.remove-app-btn:hover {
		color: var(--rougeColor);
		background-color: color-mix(in srgb, var(--rougeColor) 10%, transparent);
	}

	.empty-apps {
		margin-top: 12px;
		padding: 20px 16px;
		color: var(--white33);
	}

	/* ── Apps skeleton ── */
	.apps-skeleton {
		margin-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.skeleton-row {
		height: 44px;
		border-radius: 10px;
		background: linear-gradient(90deg, var(--white4) 25%, var(--white8) 50%, var(--white4) 75%);
		background-size: 200% 100%;
		animation: skeleton-shimmer 1.4s ease-in-out infinite;
	}

	@keyframes skeleton-shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	/* ── Save error ── */
	.save-error {
		font-size: 13px;
		color: var(--rougeColor);
		margin: 8px 0 0;
		padding-left: 2px;
	}

	/* ── Labels ── */
	.labels-input-wrap {
		margin-top: 12px;
		max-width: 480px;
	}

	.labels-wrap-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 14px;
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

	/* ── Danger zone ── */
	.danger-section {
		gap: 8px;
	}

	.btn-danger {
		margin-top: 8px;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 42px;
		padding: 0 20px;
		font-family: 'Inter', sans-serif;
		font-size: 15px;
		font-weight: 500;
		line-height: 1;
		color: var(--rougeColor);
		background: var(--gray33);
		border: none;
		border-radius: var(--radius-16);
		cursor: pointer;
		transition: transform 0.12s ease;
	}

	.btn-danger:active:not(:disabled) {
		transform: scale(0.98);
	}

	.btn-danger:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.btn-danger-large {
		padding: 12px 20px;
		font-size: 15px;
		border-radius: 16px;
	}

	/* ── Confirm modal ── */
	.confirm-body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 20px 16px 20px;
	}

	@media (min-width: 768px) {
		.confirm-body {
			padding: 20px 20px 24px;
		}
	}

	.confirm-error {
		margin: 0;
		padding: 10px 14px;
		font-size: 13px;
		color: var(--rougeColor);
		background: color-mix(in srgb, var(--rougeColor) 10%, transparent);
		border: 0.33px solid color-mix(in srgb, var(--rougeColor) 40%, transparent);
		border-radius: 12px;
	}

	.confirm-actions {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
	}

	@media (max-width: 639px) {
		.confirm-actions {
			flex-direction: column-reverse;
		}

		.confirm-actions :global(.btn-secondary-large),
		.confirm-actions .btn-danger-large {
			width: 100%;
		}
	}

	.confirm-cancel {
		min-width: 110px;
	}
</style>
