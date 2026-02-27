<script lang="js">
/**
 * EditStackModal - Modal for editing stack name, description, and apps.
 * Only shown to stack owners. Changes are saved on "Save" button click.
 */
import Modal from "$lib/components/common/Modal.svelte";
import AppPic from "$lib/components/common/AppPic.svelte";
import { X } from "lucide-svelte";
import { updateStack, deleteStack } from "$lib/nostr";
import { signEvent } from "$lib/stores/auth.svelte.js";
import { goto } from "$app/navigation";

let { 
	isOpen = $bindable(false), 
	stack = null,
	apps = [],
	onSaved = () => {},
	onDeleted = () => {}
} = $props();

// Local editing state
let editName = $state("");
let editDescription = $state("");
let editApps = $state([]);
let saving = $state(false);
let deleting = $state(false);
let error = $state("");

// Initialize edit state when modal opens
$effect(() => {
	if (isOpen && stack) {
		editName = stack.title || "";
		editDescription = stack.description || "";
		editApps = [...apps];
		error = "";
	}
});

function removeApp(appToRemove) {
	editApps = editApps.filter(app => 
		!(app.pubkey === appToRemove.pubkey && app.dTag === appToRemove.dTag)
	);
}

async function handleSave() {
	if (saving || !stack) return;
	
	saving = true;
	error = "";
	
	try {
		// Convert stack.event to plain object if it's a proxy
		const plainEvent = stack.event ? JSON.parse(JSON.stringify(stack.event)) : null;
		
		if (!plainEvent) {
			throw new Error("Stack event not found");
		}
		
		// Build the updated event
		const result = await updateStack(
			plainEvent,
			editName.trim(),
			editDescription.trim(),
			editApps,
			signEvent
		);
		
		console.log('[EditStackModal] Stack updated:', result);
		onSaved(result);
		isOpen = false;
	} catch (err) {
		console.error('[EditStackModal] Save failed:', err);
		error = err instanceof Error ? err.message : 'Failed to save changes';
	} finally {
		saving = false;
	}
}

async function handleDelete() {
	if (deleting || !stack) return;
	
	// Confirm deletion
	if (!confirm('Are you sure you want to delete this stack? This cannot be undone.')) {
		return;
	}
	
	deleting = true;
	error = "";
	
	try {
		const plainEvent = stack.event ? JSON.parse(JSON.stringify(stack.event)) : null;
		
		if (!plainEvent) {
			throw new Error("Stack event not found");
		}
		
		await deleteStack(plainEvent, signEvent);
		
		console.log('[EditStackModal] Stack deleted');
		isOpen = false;
		onDeleted();
		goto('/stacks');
	} catch (err) {
		console.error('[EditStackModal] Delete failed:', err);
		error = err instanceof Error ? err.message : 'Failed to delete stack';
	} finally {
		deleting = false;
	}
}

const hasChanges = $derived(
	editName !== (stack?.title || "") ||
	editDescription !== (stack?.description || "") ||
	editApps.length !== apps.length ||
	!editApps.every((app, i) => 
		apps[i] && app.pubkey === apps[i].pubkey && app.dTag === apps[i].dTag
	)
);
</script>

<Modal bind:open={isOpen} align="center" ariaLabel="Edit stack" title="Edit Stack">
	<div class="edit-stack-content">
		{#if error}
			<div class="error-message">{error}</div>
		{/if}
		
		<!-- Name & Description Edit Box -->
		<div class="edit-form-box">
			<input
				type="text"
				class="edit-name-input"
				placeholder="Stack Name"
				bind:value={editName}
			/>
			<div class="form-divider"></div>
			<textarea
				class="edit-description-input"
				placeholder="Add a description..."
				bind:value={editDescription}
				rows="3"
			></textarea>
		</div>
		
		<!-- Apps List -->
		{#if editApps.length > 0}
			<div class="apps-list-section">
				<p class="section-header">APPS IN STACK</p>
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
			</div>
		{:else}
			<div class="empty-apps">
				<p>No apps in this stack</p>
			</div>
		{/if}
		
		<!-- Action Buttons -->
		<div class="button-row">
			<button 
				type="button" 
				class="delete-button"
				onclick={handleDelete}
				disabled={deleting || saving}
			>
				{deleting ? 'Deleting...' : 'Delete'}
			</button>
			<button 
				type="button" 
				class="save-button"
				onclick={handleSave}
				disabled={saving || deleting || !editName.trim()}
			>
				{saving ? 'Saving...' : 'Save Stack'}
			</button>
		</div>
	</div>
</Modal>

<style>
	.edit-stack-content {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 12px;
		padding-top: 20px;
	}

	@media (min-width: 768px) {
		.edit-stack-content {
			padding: 20px;
			padding-top: 24px;
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

	.edit-form-box {
		display: flex;
		flex-direction: column;
		background-color: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white33));
		border-radius: var(--radius-16);
		overflow: hidden;
	}

	.edit-name-input {
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

	.edit-name-input::placeholder {
		color: hsl(var(--white33));
		font-weight: 500;
	}

	.form-divider {
		width: 100%;
		height: 1.4px;
		background-color: hsl(var(--white8));
	}

	.edit-description-input {
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

	.edit-description-input::placeholder {
		color: hsl(var(--white33));
	}

	.apps-list-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.section-header {
		margin: 0;
		padding-left: 16px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: hsl(var(--white33));
	}

	.apps-list {
		display: flex;
		flex-direction: column;
		background-color: hsl(var(--black33));
		border-radius: var(--radius-12);
		overflow: hidden;
		max-height: 280px;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: hsl(var(--white33)) transparent;
	}

	.app-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		border-bottom: 1px solid hsl(var(--white8));
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
		color: hsl(var(--white));
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
		color: hsl(var(--white33));
		cursor: pointer;
		transition: color 0.15s ease, background-color 0.15s ease;
		flex-shrink: 0;
	}

	.remove-app-btn:hover {
		color: hsl(var(--destructive));
		background-color: hsl(var(--destructive) / 0.1);
	}

	.empty-apps {
		padding: 24px;
		background-color: hsl(var(--black33));
		border-radius: var(--radius-12);
		text-align: center;
	}

	.empty-apps p {
		margin: 0;
		color: hsl(var(--white33));
		font-size: 14px;
	}

	.button-row {
		display: flex;
		gap: 12px;
		align-items: center;
	}

	.delete-button {
		height: 46px;
		padding: 0 20px;
		background-color: hsl(var(--black33));
		border: none;
		border-radius: var(--radius-16);
		color: hsl(var(--destructive));
		font-size: 16px;
		font-weight: 500;
		cursor: pointer;
		transition: transform 0.15s ease, opacity 0.15s ease;
		flex-shrink: 0;
	}

	.delete-button:hover:not(:disabled) {
		transform: scale(1.02);
	}

	.delete-button:active:not(:disabled) {
		transform: scale(0.98);
	}

	.delete-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.save-button {
		flex: 1;
		height: 46px;
		padding: 0 20px;
		background: var(--gradient-blurple);
		border: none;
		border-radius: var(--radius-16);
		color: hsl(var(--primary-foreground));
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.15s ease, opacity 0.15s ease;
	}

	.save-button:hover:not(:disabled) {
		transform: scale(1.02);
	}

	.save-button:active:not(:disabled) {
		transform: scale(0.98);
	}

	.save-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 767px) {
		.delete-button {
			height: 42px;
		}

		.save-button {
			height: 42px;
		}
	}
</style>
