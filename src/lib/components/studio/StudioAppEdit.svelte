<script lang="js">
/**
 * StudioAppEdit — Full-panel edit screen for app metadata.
 *
 * Replaces the StudioAppDetail content area; scrolls inside .detail-scroll.
 * Layout:
 *   - Sticky top bar: BackButton + "Edit Your App" + Save
 *   - GENERAL section: eyebrow + (AppPic with camera btn) + form box (name / desc / website)
 *   - Full-width divider
 *   - IMAGES section: eyebrow + screenshots row (Add Image card + existing with ✕)
 */
import { SvelteSet } from 'svelte/reactivity';
import BackButton from '$lib/components/common/BackButton.svelte';
import AppPic from '$lib/components/common/AppPic.svelte';
import { Camera, Cross, ChevronLeft, ChevronRight, Link } from '$lib/components/icons';
import { updateAppMetadata, parseApp } from '$lib/nostr';
import { signEvent } from '$lib/stores/auth.svelte.js';
import { uploadFileToZapstoreCdn } from '$lib/services/upload-nostr-build.js';

let {
	app = null,
	onBack = () => {},
	onSaved = (_updated) => {}
} = $props();

// ── Local edit state ───────────────────────────────────────────────────────
let editName = $state('');
let editDescription = $state('');
let editIconUrl = $state('');
let editWebsiteUrl = $state('');

/**
 * Each image entry has a stable numeric id, a url (blob: while uploading,
 * real URL once done), and a pending flag for the spinner overlay.
 * @type {{ id: number, url: string, pending: boolean }[]}
 */
let editImages = $state([]);
let _nextId = 0;

/** IDs of images whose natural dimensions are wider than tall */
let landscapeIds = new SvelteSet();

let saving = $state(false);
let saveError = $state('');

let iconPreviewError = $state(false);
let iconUploading = $state(false);

// ── Screenshots scroll ─────────────────────────────────────────────────────
let screenshotsEl = $state(null);
let scrolledRight = $state(false);
const SCROLL_STEP = 260;

function scrollScreenshots(dir) {
	if (!screenshotsEl) return;
	screenshotsEl.scrollBy({ left: dir * SCROLL_STEP, behavior: 'smooth' });
}

function handleScroll() {
	scrolledRight = (screenshotsEl?.scrollLeft ?? 0) > 4;
}

// ── Sync when app prop changes ─────────────────────────────────────────────
$effect(() => {
	if (!app) return;
	editName = app.name ?? '';
	editDescription = app.description ?? '';
	editIconUrl = app.icon ?? '';
	editWebsiteUrl = app.url ?? '';
	editImages = (app.images ?? []).map((url) => ({ id: _nextId++, url, pending: false }));
	landscapeIds.clear();
	saveError = '';
	iconPreviewError = false;
	scrolledRight = false;
});

// ── Image handling ─────────────────────────────────────────────────────────
function removeImage(id) {
	const entry = editImages.find((img) => img.id === id);
	if (entry?.pending && entry.url.startsWith('blob:')) URL.revokeObjectURL(entry.url);
	landscapeIds.delete(id);
	editImages = editImages.filter((img) => img.id !== id);
}

function handleImgLoad(e, id) {
	const img = /** @type {HTMLImageElement} */ (e.target);
	if (img.naturalWidth > img.naturalHeight) landscapeIds.add(id);
}

async function handleIconFileChange(e) {
	const file = e.target?.files?.[0];
	if (!file) return;
	iconUploading = true;
	iconPreviewError = false;
	try {
		editIconUrl = await uploadFileToZapstoreCdn(file, signEvent);
	} catch (err) {
		console.error('[StudioAppEdit] icon upload failed:', err);
	} finally {
		iconUploading = false;
		if (e.target) e.target.value = '';
	}
}

async function handleScreenshotFilesChange(e) {
	const files = Array.from(e.target?.files ?? []);
	if (!files.length) return;
	saveError = '';
	if (e.target) e.target.value = '';

	// Add entries with blob URLs immediately for instant preview
	const pending = files.map((f) => ({ id: _nextId++, url: URL.createObjectURL(f), pending: true }));
	editImages = [...editImages, ...pending];

	// Upload each in parallel; swap blob URL for real URL on success
	await Promise.all(
		files.map(async (file, i) => {
			const { id, url: blobUrl } = pending[i];
			try {
				const realUrl = await uploadFileToZapstoreCdn(file, signEvent);
				URL.revokeObjectURL(blobUrl);
				editImages = editImages.map((img) => img.id === id ? { ...img, url: realUrl, pending: false } : img);
			} catch (err) {
				URL.revokeObjectURL(blobUrl);
				landscapeIds.delete(id);
				editImages = editImages.filter((img) => img.id !== id);
				saveError = /** @type {any} */ (err)?.message ?? 'Screenshot upload failed';
			}
		})
	);
}

// ── Save ───────────────────────────────────────────────────────────────────
async function handleSave() {
	if (saving || !app?.event) return;
	if (!editName.trim()) {
		saveError = 'App name is required.';
		return;
	}
	saving = true;
	saveError = '';
	try {
		const signed = await updateAppMetadata(
			app.event,
			{
				name: editName,
				description: editDescription,
				icon: editIconUrl,
				url: editWebsiteUrl,
				images: editImages.filter((img) => !img.pending).map((img) => img.url)
			},
			signEvent
		);
		onSaved(signed ? parseApp(signed) : null);
	} catch (err) {
		console.error('[StudioAppEdit] save failed:', err);
		saveError = err?.message ?? 'Failed to save. Please try again.';
		saving = false;
	}
}
</script>

{#if app}
<div class="edit-wrap">

	<!-- ── Sticky top bar ───────────────────────────────────────────────── -->
	<div class="edit-topbar">
		<BackButton onBack={onBack} />
		<span class="edit-topbar-title">Edit Your App</span>
		<button
			type="button"
			class="btn-primary-small edit-save-btn"
			onclick={handleSave}
			disabled={saving}
		>
			{saving ? 'Saving…' : 'Save'}
		</button>
	</div>

	<div class="edit-body">

		<!-- ── GENERAL ──────────────────────────────────────────────────── -->
		<section class="edit-section">
			<span class="eyebrow-label section-eyebrow">General</span>

			<div class="general-row">

				<!-- App icon + camera upload button -->
				<div class="icon-outer">
					{#if iconUploading}
						<div class="icon-uploading">
							<div class="upload-spinner"></div>
						</div>
					{:else}
						<AppPic
							iconUrl={iconPreviewError ? null : editIconUrl}
							name={editName || app.name}
							identifier={app.dTag}
							size="2xl"
							className="edit-app-pic"
							onClick={() => {}}
						/>
					{/if}

					<label class="icon-camera-btn" aria-label="Change app icon">
						<input
							type="file"
							accept="image/*"
							class="hidden-file-input"
							onchange={handleIconFileChange}
							disabled={iconUploading}
						/>
						<Camera size={18} strokeWidth={1.4} color="var(--black66)" />
					</label>
				</div>

				<!-- Form box: name / description / website -->
				<div class="form-box">
					<input
						type="text"
						class="form-input form-input--name"
						bind:value={editName}
						placeholder="App name"
						maxlength="60"
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
					<div class="form-divider"></div>
					<div class="form-row-website">
						<Link variant="outline" size={15} strokeWidth={1.4} color="var(--white33)" />
						<input
							type="url"
							class="form-input form-input--website"
							bind:value={editWebsiteUrl}
							placeholder="Website URL"
							autocomplete="off"
						/>
					</div>
				</div>

			</div>
		</section>

		<!-- ── Full-width divider ────────────────────────────────────────── -->
		<div class="full-divider" aria-hidden="true"></div>

		<!-- ── IMAGES ───────────────────────────────────────────────────── -->
		<section class="edit-section">
			<span class="eyebrow-label section-eyebrow">Images</span>

			<div class="screenshots-wrap">
				<div
					class="screenshots-scroll"
					bind:this={screenshotsEl}
					onscroll={handleScroll}
				>
				<div class="screenshots-content">

					<!-- Uploaded / pending images -->
					{#each editImages as img (img.id)}
						<div
							class="screenshot-item"
							class:landscape={landscapeIds.has(img.id)}
						>
							<div class="screenshot-img-wrap">
								<img
									src={img.url}
									alt="Screenshot"
									class="screenshot-img"
									class:pending={img.pending}
									loading="lazy"
									onload={(e) => handleImgLoad(e, img.id)}
								/>
								{#if img.pending}
									<div class="ss-pending-overlay">
										<div class="upload-spinner"></div>
									</div>
								{/if}
								<button
									type="button"
									class="screenshot-remove"
									onclick={() => removeImage(img.id)}
									aria-label="Remove screenshot"
								>
									<Cross variant="outline" color="var(--white66)" size={11} strokeWidth={2} />
								</button>
							</div>
						</div>
					{/each}

					<!-- Add Image card — after uploaded images -->
					<label class="screenshot-add-card" aria-label="Add screenshot">
						<input
							type="file"
							accept="image/*"
							multiple
							class="hidden-file-input"
							onchange={handleScreenshotFilesChange}
						/>
						<Camera size={32} strokeWidth={1.4} color="var(--white33)" />
					</label>

					<!-- Empty placeholder slots -->
					{#each { length: Math.max(0, 6 - editImages.length) } as _, i (i)}
						<div class="screenshot-placeholder" aria-hidden="true"></div>
					{/each}

				</div>
				</div>

				{#if scrolledRight}
					<div class="ss-fade ss-fade-left" aria-hidden="true"></div>
				{/if}
				<div class="ss-fade ss-fade-right" aria-hidden="true"></div>

				{#if scrolledRight}
					<button class="ss-btn ss-btn-left" onclick={() => scrollScreenshots(-1)} aria-label="Scroll left">
						<ChevronLeft size={14} strokeWidth={1.4} color="var(--white66)" />
					</button>
				{/if}
				<button class="ss-btn ss-btn-right" onclick={() => scrollScreenshots(1)} aria-label="Scroll right">
					<ChevronRight size={14} strokeWidth={1.4} color="var(--white66)" />
				</button>
			</div>

			{#if saveError}
				<p class="save-error">{saveError}</p>
			{/if}
		</section>

		<!-- ── Divider under IMAGES ──────────────────────────────────────── -->
		<div class="full-divider" aria-hidden="true"></div>

	</div>
</div>
{/if}

<style>
	/* ── Outer wrapper ── */
	.edit-wrap {
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}

	/* ── Sticky top bar ── */
	.edit-topbar {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		background: color-mix(in srgb, var(--black) 70%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
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

	/* ── Body: padded content under the topbar ── */
	.edit-body {
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

	/* ── Full-width divider (bleeds to container edges) ── */
	.full-divider {
		width: 100%;
		height: 1.4px;
		background: var(--white11);
		flex-shrink: 0;
	}

	/* ── GENERAL row: icon + form box ── */
	.general-row {
		display: flex;
		align-items: flex-start;
		gap: 18px;
		margin-top: 12px;
	}

	/* Icon wrapper */
	.icon-outer {
		position: relative;
		flex-shrink: 0;
		line-height: 0;
	}

	/* Neutralize AppPic button behavior */
	:global(.edit-app-pic.app-pic) {
		cursor: default !important;
	}

	:global(.edit-app-pic.app-pic:hover),
	:global(.edit-app-pic.app-pic:active) {
		transform: none !important;
	}

	.icon-uploading {
		width: 96px;
		height: 96px;
		border-radius: 24px;
		background: var(--white8);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Camera button: bottom-right corner, white33 bg + blur, no border */
	.icon-camera-btn {
		position: absolute;
		bottom: -6px;
		right: -6px;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--white33);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		z-index: 2;
		transition: background 0.15s ease, transform 0.12s ease;
	}

	.icon-camera-btn:hover {
		transform: scale(1.08);
	}

	.icon-camera-btn:active {
		transform: scale(0.92);
	}

	/* ── Form box (ForumPostModal-inspired) ── */
	.form-box {
		flex: 1;
		min-width: 0;
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

	.form-row-website {
		display: flex;
		align-items: center;
		padding-left: 14px;
		gap: 12px;
		flex-shrink: 0;
	}

	.form-row-website :global(svg) {
		flex-shrink: 0;
	}

	.form-input--website {
		font-size: 14px;
		font-weight: 400;
		padding-left: 0;
	}

	.form-divider {
		width: 100%;
		height: 1.4px;
		background: var(--white8);
		flex-shrink: 0;
	}

	/* ── Screenshots ── */
	.screenshots-wrap {
		position: relative;
		margin-top: 12px;
	}

	.screenshots-scroll {
		margin-left: -12px;
		margin-right: -12px;
		margin-top: -3px;
		margin-bottom: -3px;
		padding-left: 12px;
		padding-right: 12px;
		padding-top: 3px;
		padding-bottom: 3px;
		overflow-x: auto;
		overflow-y: clip;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	@media (min-width: 768px) {
		.screenshots-scroll {
			margin-left: -16px;
			margin-right: -16px;
			padding-left: 16px;
			padding-right: 16px;
		}
	}

	.screenshots-scroll::-webkit-scrollbar {
		display: none;
	}

	.screenshots-content {
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}

	/* Add Image card — portrait default, same height as screenshot items */
	.screenshot-add-card {
		width: 84px;
		height: 180px;
		flex-shrink: 0;
		border-radius: 14px;
		border: 0.33px solid var(--white16);
		background: var(--white8);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: transform 0.15s ease;
		position: relative;
		overflow: hidden;
	}

	.screenshot-add-card:hover {
		transform: scale(1.02);
	}

	.screenshot-add-card:active {
		transform: scale(0.98);
	}

	@media (min-width: 640px) {
		.screenshot-add-card {
			width: 96px;
			height: 200px;
			border-radius: 16px;
		}
	}

	/* Empty placeholder slots */
	.screenshot-placeholder {
		width: 84px;
		height: 180px;
		flex-shrink: 0;
		border-radius: 14px;
		background: var(--white4);
		pointer-events: none;
	}

	@media (min-width: 640px) {
		.screenshot-placeholder {
			width: 96px;
			height: 200px;
			border-radius: 16px;
		}
	}

	/* Screenshot items — portrait default, auto-width when landscape */
	.screenshot-item {
		position: relative;
		width: 84px;
		height: 180px;
		flex-shrink: 0;
	}

	.screenshot-item.landscape {
		width: auto;
	}

	@media (min-width: 640px) {
		.screenshot-item {
			width: 96px;
			height: 200px;
		}

		.screenshot-item.landscape {
			width: auto;
		}
	}

	/* Inner wrap clips the image to rounded corners */
	.screenshot-img-wrap {
		width: 100%;
		height: 100%;
		border-radius: 14px;
		overflow: hidden;
		background: var(--white8);
		border: 0.33px solid var(--white16);
		position: relative;
	}

	@media (min-width: 640px) {
		.screenshot-img-wrap {
			border-radius: 16px;
		}
	}

	.screenshot-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.screenshot-img.pending {
		opacity: 0.4;
	}

	/* Spinner overlay while uploading */
	.ss-pending-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--black) 20%, transparent);
	}

	/* ✕ remove button — inside image, 8px from top-right */
	.screenshot-remove {
		position: absolute;
		top: 8px;
		right: 8px;
		z-index: 2;
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--gray33);
		border: none;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.screenshot-remove:hover {
		background: var(--gray44);
	}

	.screenshot-remove:active {
		transform: scale(0.88);
	}

	/* Fades */
	.ss-fade {
		position: absolute;
		top: 0;
		bottom: 6px;
		pointer-events: none;
		z-index: 5;
	}

	.ss-fade-left {
		left: -12px;
		width: 12px;
		background: linear-gradient(to right, var(--black), transparent);
	}

	.ss-fade-right {
		right: -12px;
		width: 12px;
		background: linear-gradient(to left, var(--black), transparent);
	}

	@media (min-width: 768px) {
		.ss-fade-left { left: -16px; width: 16px; }
		.ss-fade-right { right: -16px; width: 16px; }
	}

	/* Chevron buttons — desktop + mouse only */
	.ss-btn { display: none; }

	@media (min-width: 768px) and (hover: hover) and (pointer: fine) {
		.ss-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			position: absolute;
			top: 50%;
			transform: translateY(-60%) scale(1);
			width: 32px;
			height: 32px;
			border-radius: 50%;
			border: none;
			background: var(--white16);
			backdrop-filter: blur(4px);
			-webkit-backdrop-filter: blur(4px);
			cursor: pointer;
			z-index: 10;
			transition: transform 0.18s ease;
		}

		.ss-btn:hover { transform: translateY(-60%) scale(1.1); }
		.ss-btn:active { transform: translateY(-60%) scale(0.92); }

		.ss-btn-right { right: -48px; }
		.ss-btn-right :global(svg) { padding-left: 1px; }
		.ss-btn-left { left: -48px; }
		.ss-btn-left :global(svg) { padding-right: 1px; }
	}

	/* ── Upload spinner ── */
	.upload-spinner {
		width: 20px;
		height: 20px;
		border: 2px solid var(--white16);
		border-top-color: var(--white66);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Hidden file inputs */
	.hidden-file-input {
		position: absolute;
		width: 0;
		height: 0;
		opacity: 0;
		pointer-events: none;
	}

	/* Error */
	.save-error {
		font-size: 13px;
		color: var(--rougeColor);
		margin: 0;
		padding-left: 14px;
	}
</style>
