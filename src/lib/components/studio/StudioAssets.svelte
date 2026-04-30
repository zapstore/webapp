<script>
	import { assets } from '$app/paths';
	import { goto } from '$app/navigation';
	import BackButton from '$lib/components/common/BackButton.svelte';
	import CodeBlock from '$lib/components/common/CodeBlock.svelte';
	import Modal from '$lib/components/common/Modal.svelte';
	import Download from '$lib/components/icons/Download.svelte';
	import Code2 from '$lib/components/icons/Code2.svelte';
	import { SITE_URL } from '$lib/config.js';

	const badgeUrl = `${SITE_URL}/images/get-it-on-zapstore.png`;
	const badgeLink = `${SITE_URL}`;

	const badgeHtml = `<a href="${badgeLink}">\n  <img src="${badgeUrl}" alt="Get it on Zapstore" height="60">\n</a>`;
	const badgeMd = `[![Get it on Zapstore](${badgeUrl})](${badgeLink})`;

	let badgeCodeOpen = $state(false);
</script>

<div class="assets-scroll">

	<div class="assets-topbar">
		<BackButton onBack={() => goto('/studio/insights')} />
		<span class="assets-topbar-title">Assets</span>
	</div>

	<div class="assets-body">

		<!-- ── Badge panel ─────────────────────────────────────────────────────── -->
		<div class="asset-panel">
			<div class="asset-row">
				<div class="asset-cell asset-cell-media">
					<img
						src={`${assets}/images/get-it-on-zapstore.png`}
						alt="Get it on Zapstore"
						class="badge-img"
					/>
				</div>
				<div class="asset-cell asset-cell-info">
					<div class="asset-info-content">
						<h3 class="asset-name">Badge</h3>
						<p class="asset-desc">
							Link users directly to your app on Zapstore. Drop the badge on your website, GitHub
							README, or anywhere you promote your app.
						</p>
					</div>
				<div class="asset-actions badge-actions">
					<a
						href={`${assets}/images/get-it-on-zapstore.png`}
						download="get-it-on-zapstore.png"
						class="btn-secondary-small action-btn"
					>
						<Download variant="fill" size={15} color="var(--white33)" />
						Download
					</a>
					<button
						type="button"
						class="btn-secondary-small action-btn"
						onclick={() => (badgeCodeOpen = true)}
					>
						<Code2 size={15} strokeWidth={1.4} color="var(--white33)" />
						Code
					</button>
				</div>
				</div>
			</div>
		</div>

		<!-- ── Logo panel ──────────────────────────────────────────────────────── -->
		<div class="asset-panel">
			<div class="asset-row">
				<div class="asset-cell asset-cell-media">
					<img src={`${assets}/images/logo-dark.svg`} alt="Zapstore" class="logo-img" />
				</div>
				<div class="asset-cell asset-cell-info">
					<div class="asset-info-content">
						<h3 class="asset-name">Logo</h3>
						<p class="asset-desc">White SVG mark, transparent background.</p>
					</div>
				<div class="asset-actions">
					<a
						href={`${assets}/images/logo-dark.svg`}
						download="zapstore-logo.svg"
						class="btn-secondary-small action-btn"
					>
							<Download variant="fill" size={15} color="var(--white33)" />
							Download
						</a>
					</div>
				</div>
			</div>
		</div>

	</div>
</div>

<!-- Badge embed code modal -->
<Modal bind:open={badgeCodeOpen} title="Embed Code">
	<div class="code-modal-body">
		<CodeBlock code={badgeHtml} language="HTML" background="black33" />
		<CodeBlock code={badgeMd} language="Markdown" background="black33" />
	</div>
</Modal>

<style>
	/* ── Scroll wrapper ────────────────────────────────────────────────────── */
	.assets-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	/* ── Top bar ───────────────────────────────────────────────────────────── */
	.assets-topbar {
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
		border-bottom: 1px solid var(--white16);
		flex-shrink: 0;
	}

	@media (min-width: 768px) {
		.assets-topbar { padding: 10px 16px; }
	}

	.assets-topbar-title {
		flex: 1;
		font-size: 15px;
		font-weight: 500;
		color: var(--white);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ── Body ─────────────────────────────────────────────────────────────── */
	.assets-body {
		padding: 20px 20px 48px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		flex: 1;
	}

	@media (min-width: 768px) {
		.assets-body { padding: 20px 26px 48px; }
	}

	/* ── Panel ────────────────────────────────────────────────────────────── */
	.asset-panel {
		background: var(--gray33);
		border: 1.4px solid var(--white16);
		border-radius: 16px;
		overflow: hidden;
	}

	/* ── Row ──────────────────────────────────────────────────────────────── */
	.asset-row {
		display: flex;
		flex-direction: column;
	}

	@media (min-width: 560px) {
		.asset-row { flex-direction: row; }
	}

	/* ── Cells — golden ratio (left ~38%, right ~62%) on desktop ─────────── */
	.asset-cell-media {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		padding: 28px 32px;
	}

	@media (min-width: 560px) {
		.asset-cell-media {
			border-right: 1.4px solid var(--white16);
		}
		.asset-cell-info {
			flex: 1.618;
		}
	}

	@media (max-width: 559px) {
		.asset-cell-media {
			border-bottom: 1.4px solid var(--white16);
		}
	}

	.asset-cell-info {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 24px;
		justify-content: center;
	}

	/* ── Badge image — fills available left column width ─────────────────── */
	.badge-img {
		width: 100%;
		height: auto;
		display: block;
	}

	/* ── Logo image ───────────────────────────────────────────────────────── */
	.logo-img {
		width: 52px;
		height: auto;
	}

	/* ── Info content ─────────────────────────────────────────────────────── */
	.asset-info-content {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.asset-name {
		font-size: 18px;
		font-weight: 600;
		color: var(--white);
		margin: 0;
		letter-spacing: -0.01em;
	}

	.asset-desc {
		font-size: 14px;
		color: var(--white66);
		margin: 0;
		line-height: 1.55;
	}

	/* ── Action buttons ───────────────────────────────────────────────────── */
	.asset-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.badge-actions {
		gap: 16px;
	}

	.action-btn {
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		font-size: 12px;
	}

	/* ── Code modal body — padding matches modal title-block horizontal inset */
	.code-modal-body {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px 16px 24px;
	}

	@media (min-width: 768px) {
		.code-modal-body { padding: 16px 20px 28px; }
	}
</style>
