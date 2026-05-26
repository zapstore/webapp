<script lang="js">
	/**
	 * StudioStackEdit — Full-panel edit screen for stack metadata and apps.
	 *
	 * Labels are `t` tags stored in the stack event, edited locally and
	 * saved together with name/description via the main Save button.
	 * Same pattern as StudioAppEdit (no immediate relay publishing).
	 */
	import AppPic from '$lib/components/common/AppPic.svelte';
	import InputLabel from '$lib/components/common/InputLabel.svelte';
	import Label from '$lib/components/common/Label.svelte';
	import { X } from 'lucide-svelte';
	import { Plus } from '$lib/components/icons';
	import AddAppModal from '$lib/components/modals/AddAppModal.svelte';
	import { updateStack, deleteStack, publishStack } from '$lib/purpleweb';
	import { encodeStackNaddr } from '$lib/nostr/models.js';
	import { signEvent, getCurrentPubkey } from '$lib/stores/auth.svelte.js';

	let {
		mode = 'edit',
		stack = null,
		apps = [],
		appsLoading = false,
		onBack = () => {},
		onSaved = (_updated) => {},
		onPublished = (_signed) => {},
		onDeleted = () => {}
	} = $props();

	const isCreate = $derived(mode === 'create');

	// ── Local edit state ───────────────────────────────────────────────────────
	let editName = $state('');
	let editDescription = $state('');
	let editApps = $state([]);

	let saving = $state(false);
	let saveError = $state('');

	// ── Delete state ───────────────────────────────────────────────────────────
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
	let addAppModalOpen = $state(false);

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
		if (isCreate) {
			editName = '';
			editDescription = '';
			editLabels = [];
			saveError = '';
			deleting = false;
			deleteError = '';
			return;
		}
		if (!stack) return;
		editName = stack.title || '';
		editDescription = stack.description || '';
		editLabels = (stack.event?.tags ?? []).filter((t) => t[0] === 't' && t[1]).map((t) => t[1]);
		saveError = '';
		deleting = false;
		deleteError = '';
	});

	// ── Sync apps list separately so it never resets name/description ─────────
	$effect(() => {
		if (isCreate) {
			editApps = [];
			return;
		}
		editApps = [...apps];
	});

	function removeApp(appToRemove) {
		editApps = editApps.filter(
			(a) => !(a.pubkey === appToRemove.pubkey && a.dTag === appToRemove.dTag)
		);
	}

	function handleAddApp(/** @type {{ app?: import('$lib/nostr/models').App }} */ payload) {
		const app = payload?.app;
		if (!app?.pubkey || !app?.dTag) return;
		const exists = editApps.some((a) => a.pubkey === app.pubkey && a.dTag === app.dTag);
		if (exists) return;
		editApps = [...editApps, app];
	}

	// ── Save / publish ─────────────────────────────────────────────────────────
	async function handleSave() {
		if (saving || isCreate || !stack) return;
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

	async function handlePublish() {
		if (saving || !isCreate) return;
		if (!editName.trim()) {
			saveError = 'Stack name is required.';
			return;
		}
		saving = true;
		saveError = '';
		try {
			const signed = await publishStack(
				editName.trim(),
				editDescription.trim(),
				editApps,
				signEvent,
				editLabels
			);
			onPublished(signed);
		} catch (err) {
			console.error('[StudioStackEdit] publish failed:', err);
			saveError = err?.message ?? 'Failed to publish. Please try again.';
		} finally {
			saving = false;
		}
	}

	// ── Delete ─────────────────────────────────────────────────────────────────
	async function handleDelete() {
		if (deleting || saving || !stack) return;
		deleteError = '';
		const confirmed = confirm(
			'Delete this stack? This publishes a deletion request to the network. This cannot be undone.'
		);
		if (!confirmed) return;

		const plainEvent = stack.event ? JSON.parse(JSON.stringify(stack.event)) : null;
		if (!plainEvent) {
			deleteError = 'Cannot delete — stack data is incomplete. Reload Studio and try again.';
			return;
		}
		deleting = true;
		try {
			await deleteStack(plainEvent, signEvent);
			onDeleted();
		} catch (err) {
			console.error('[StudioStackEdit] delete failed:', err);
			deleteError = err?.message ?? 'Failed to delete. Please try again.';
		} finally {
			deleting = false;
		}
	}
</script>

{#if isCreate || stack}
	<div class="edit-wrap">
		<!-- ── Sticky top bar ───────────────────────────────────────────────── -->
		<div class="edit-topbar">
			<span class="edit-topbar-title">{isCreate ? 'New Stack' : 'Edit Your Stack'}</span>
			<div class="topbar-actions">
				<button type="button" class="btn-secondary-xs btn-secondary-light topbar-cancel-btn" onclick={onBack}>
					Cancel
				</button>
				{#if !isCreate && stack?.pubkey && stack?.dTag}
					<a
						class="btn-secondary-xs btn-secondary-light topbar-secondary-btn"
						href="/stacks/{encodeStackNaddr(stack.pubkey, stack.dTag)}"
					>
						View
					</a>
				{/if}
				<button
					type="button"
					class="btn-primary-small edit-save-btn"
					onclick={isCreate ? handlePublish : handleSave}
					disabled={saving}
				>
					{#if isCreate}
						{saving ? 'Publishing…' : 'Publish'}
					{:else}
						{saving ? 'Saving…' : 'Save'}
					{/if}
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

				<div class="apps-list">
					<button
						type="button"
						class="app-row add-app-row"
						onclick={() => (addAppModalOpen = true)}
					>
						<div class="app-info">
							<span class="add-app-icon-slot" aria-hidden="true">
								<span class="add-app-action-btn">
									<Plus variant="outline" color="var(--white33)" size={16} strokeWidth={2.8} />
								</span>
							</span>
							<span class="add-app-label">Add App</span>
						</div>
					</button>

					{#if appsLoading && !isCreate}
						<div class="apps-skeleton-in-list" aria-hidden="true">
							<div class="skeleton-row"></div>
							<div class="skeleton-row"></div>
							<div class="skeleton-row"></div>
						</div>
					{:else if editApps.length > 0}
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
					{/if}
				</div>
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

			{#if isCreate}
				<div class="full-divider" aria-hidden="true"></div>
			{:else}
				<!-- ── Full-width divider ────────────────────────────────────────── -->
				<div class="full-divider" aria-hidden="true"></div>

				<!-- ── DANGER ZONE ─────────────────────────────────────────────── -->
				<section class="edit-section danger-section">
					<span class="eyebrow-label section-eyebrow">Danger zone</span>

					<button
						type="button"
						class="btn-danger"
						onclick={handleDelete}
						disabled={deleting || saving}
					>
						{deleting ? 'Deleting…' : 'Delete this Stack'}
					</button>

					{#if deleteError}
						<p class="save-error">{deleteError}</p>
					{/if}
				</section>

				<div class="full-divider" aria-hidden="true"></div>
			{/if}
		</div>

		<AddAppModal
			bind:isOpen={addAppModalOpen}
			getCurrentPubkey={getCurrentPubkey}
			onAdd={handleAddApp}
		/>
	</div>
{/if}

<style>
	/* ── Outer wrapper ── */
	.edit-wrap {
		display: flex;
		flex-direction: column;
		flex: 1;
		height: 100%;
		min-height: 100%;
		overflow: hidden;
		position: relative;
		isolation: isolate;
	}

	/* ── Top bar ── */
	.edit-topbar {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--shell-border);
	}

	@media (min-width: 768px) {
		.edit-topbar {
			padding: 10px 16px;
		}
	}

	.edit-topbar-title {
		flex: 1;
		font-size: 14px;
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

	.topbar-cancel-btn {
		color: var(--white33);
	}

	.topbar-secondary-btn {
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
		height: 1px;
		background: var(--shell-border);
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
		height: 1px;
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

	.add-app-row {
		width: 100%;
		border: none;
		background: transparent;
		cursor: pointer;
		text-align: left;
	}

	.add-app-icon-slot {
		width: 38px;
		height: 38px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2px;
		box-sizing: border-box;
	}

	.add-app-action-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--white8);
		border-radius: 8px;
		flex-shrink: 0;
	}

	.add-app-row:active .add-app-action-btn {
		transform: scale(0.97);
	}

	.add-app-label {
		font-size: 15px;
		font-weight: 500;
		color: var(--white33);
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

	/* ── Apps skeleton ── */
	.apps-skeleton-in-list {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 8px 12px 12px;
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
</style>
