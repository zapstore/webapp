<script lang="js">
	/**
	 * Label-shaped chip: gray33 fill + single outer stroke like InputLabel (continuous path incl. triangle).
	 * Chevron anchored to chip’s right edge; faux placeholder dims to white33 on focus.
	 */
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { ChevronDown, Cross } from '$lib/components/icons';

	/** @type {HTMLDivElement | null} */
	let chipEl = $state(null);
	/** @type {HTMLDivElement | null} */
	let menuEl = $state(null);
	/** @type {HTMLInputElement | null} */
	let searchInput = $state(null);
	let open = $state(false);
	let focused = $state(false);
	let filterQuery = $state('');
	let chipWidth = $state(0);
	/** @type {string} */
	let menuPositionStyle = $state('');

	const inputId = 'zap-apps-alt-to-input';
	/** After chevron toggles menu, ignore one `focus` so `open` is not forced back to true. */
	let skipOpenFromFocus = false;
	const TRI_W = 24;
	const H = 32;
	const R = 12;

	const PLATFORMS = [
		'YouTube',
		'Twitter',
		'Discord',
		'WhatsApp',
		'Notion',
		'Google',
		'Facebook',
		'Instagram',
		'TikTok',
		'Reddit',
		'Slack',
		'Zoom',
		'Spotify',
		'LinkedIn',
		'Telegram',
		'GitHub',
		'Figma',
		'Microsoft',
		'Apple',
		'Amazon',
		'Netflix',
		'Gmail',
		'Outlook',
		'Chrome',
		'Safari',
		'Dropbox',
		'Airbnb',
		'Uber',
		'PayPal',
		'Stripe'
	];

	const showFauxPlaceholder = $derived(filterQuery.trim() === '');

	/** One continuous outer path (no stroke on inner rect↔triangle seam). */
	const outlinePathD = $derived.by(() => {
		const W = chipWidth;
		if (W < TRI_W + R + 4) return '';
		const Wc = W - TRI_W;
		return [
			`M ${R} 0`,
			`H ${Wc}`,
			`L ${Wc + 4} 0`,
			`Q ${Wc + 9} 2 ${Wc + 14} 6`,
			`Q ${Wc + 19} 10 ${Wc + 23} 14`,
			`Q ${Wc + 23.5} 16 ${Wc + 23} 18`,
			`Q ${Wc + 19} 22 ${Wc + 14} 26`,
			`Q ${Wc + 9} 30 ${Wc + 4} 32`,
			`L ${Wc} 32`,
			`L 12 32`,
			`A ${R} ${R} 0 0 1 0 ${H - R}`,
			`V ${R}`,
			`A ${R} ${R} 0 0 1 ${R} 0`,
			`Z`
		].join(' ');
	});

	const filteredPlatforms = $derived.by(() => {
		const q = filterQuery.trim().toLowerCase();
		if (!q) return [...PLATFORMS];
		return PLATFORMS.filter((p) => p.toLowerCase().includes(q));
	});

	function updateMenuPosition() {
		if (!open || !chipEl) return;
		const r = chipEl.getBoundingClientRect();
		const gap = 6;
		const pad = 16;
		const vw = globalThis.innerWidth;
		const vh = globalThis.innerHeight;
		const menuWidth = Math.min(320, Math.max(220, r.width));
		let left = r.left;
		if (left + menuWidth > vw - pad) left = vw - pad - menuWidth;
		if (left < pad) left = pad;
		const maxH = Math.min(280, vh - pad * 2);
		const preferredTop = r.bottom + gap;
		let top = preferredTop;
		if (top + maxH > vh - pad) {
			const above = r.top - gap - maxH;
			if (above >= pad) top = above;
		}
		menuPositionStyle = `top:${top}px;left:${left}px;width:${menuWidth}px;max-height:${maxH}px`;
	}

	$effect(() => {
		if (!open) {
			menuPositionStyle = '';
			return;
		}
		tick().then(() => updateMenuPosition());
		const onScrollOrResize = () => updateMenuPosition();
		globalThis.addEventListener('scroll', onScrollOrResize, true);
		globalThis.addEventListener('resize', onScrollOrResize);
		return () => {
			globalThis.removeEventListener('scroll', onScrollOrResize, true);
			globalThis.removeEventListener('resize', onScrollOrResize);
		};
	});

	$effect(() => {
		if (!open) return;
		const onKey = (/** @type {KeyboardEvent} */ e) => {
			if (e.key === 'Escape') open = false;
		};
		const onPointer = (/** @type {PointerEvent} */ e) => {
			const t = e.target;
			if (!(t instanceof globalThis.Element)) return;
			if (chipEl?.contains(t)) return;
			if (menuEl?.contains(t)) return;
			open = false;
		};
		document.addEventListener('keydown', onKey, true);
		document.addEventListener('pointerdown', onPointer, true);
		return () => {
			document.removeEventListener('keydown', onKey, true);
			document.removeEventListener('pointerdown', onPointer, true);
		};
	});

	/** One interaction model: chevron toggles menu + always focuses input; rest of chip focuses + opens menu. */
	function chipPointerDownCapture(/** @type {PointerEvent} */ e) {
		const t = e.target;
		if (!(t instanceof Element)) return;
		if (t.closest('.alt-chevron-btn')) {
			e.preventDefault();
			skipOpenFromFocus = true;
			open = !open;
			searchInput?.focus();
			globalThis.requestAnimationFrame(() => {
				skipOpenFromFocus = false;
			});
			return;
		}
		if (t.closest('input') === searchInput) return;
		if (t.closest('.alt-content') || t.closest('.alt-triangle')) {
			searchInput?.focus();
			open = true;
		}
	}

	function onInputFocus() {
		focused = true;
		if (!skipOpenFromFocus) open = true;
	}

	function onInputBlur() {
		focused = false;
	}

	function submitFreeform() {
		const q = filterQuery.trim();
		if (!q) return;
		open = false;
		goto(`/apps?q=${encodeURIComponent(`alternative:${q}`)}`);
	}

	function pick(/** @type {string} */ name) {
		open = false;
		filterQuery = '';
		goto(`/apps?q=${encodeURIComponent(`alternative:${name}`)}`);
	}
</script>

<div
	class="alt-chip"
	bind:this={chipEl}
	bind:clientWidth={chipWidth}
	onpointerdowncapture={chipPointerDownCapture}
>
	<div class="alt-content">
		<label class="alt-field" for={inputId}>
			{#if showFauxPlaceholder}
				<span
					class="alt-faux-ph"
					class:alt-faux-ph--focused={focused}
					aria-hidden="true"
				>
					<span class="alt-faux-prefix">Alternative to </span><span class="alt-faux-dots">…</span>
				</span>
			{/if}
			<input
				id={inputId}
				type="text"
				class="alt-input"
				bind:value={filterQuery}
				bind:this={searchInput}
				autocomplete="off"
				spellcheck={false}
				aria-label="Platform to find alternatives for"
				aria-controls={open ? 'zap-apps-alt-menu' : undefined}
				aria-autocomplete="list"
				onfocus={onInputFocus}
				onblur={onInputBlur}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						submitFreeform();
					}
				}}
			/>
		</label>
	</div>
	<svg
		class="alt-triangle"
		width="24"
		height="32"
		viewBox="0 0 24 32"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
	>
		<path
			d="M0 0 L4 0 Q9 2 14 6 Q19 10 23 14 Q23.5 16 23 18 Q19 22 14 26 Q9 30 4 32 L0 32 Z"
			fill="var(--gray33)"
		/>
	</svg>

	{#if outlinePathD}
		<svg
			class="alt-outline"
			width={chipWidth}
			height={H}
			viewBox={`0 0 ${chipWidth} ${H}`}
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<path
				d={outlinePathD}
				fill="none"
				stroke="var(--white33)"
				stroke-width="0.5"
				vector-effect="non-scaling-stroke"
			/>
		</svg>
	{/if}

	<button
		type="button"
		class="alt-chevron-btn"
		aria-label={open ? 'Close suggestions' : 'Open suggestions'}
		aria-expanded={open}
	>
		{#if open}
			<Cross variant="outline" size={10} color="var(--white33)" strokeWidth={1.4} />
		{:else}
			<ChevronDown variant="outline" size={14} color="var(--white33)" strokeWidth={1.4} />
		{/if}
	</button>
</div>

{#if open}
	<div
		id="zap-apps-alt-menu"
		class="alt-menu"
		bind:this={menuEl}
		role="menu"
		aria-label="Suggested platforms"
		style={menuPositionStyle}
	>
		<div class="alt-menu-list" role="none">
			{#each filteredPlatforms as name (name)}
				<button type="button" role="menuitem" class="alt-menu-item" onclick={() => pick(name)}>
					{name}
				</button>
			{:else}
				<div class="alt-menu-empty" role="presentation">No match — press Enter to search</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.alt-chip {
		position: relative;
		display: inline-flex;
		align-items: center;
		height: 32px;
		flex-shrink: 0;
		cursor: text;
		min-width: 168px;
		max-width: 280px;
	}

	.alt-content {
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 0;
		height: 32px;
		padding-left: 12px;
		padding-right: 8px;
		background-color: var(--gray33);
		border-radius: 12px 0 0 12px;
		overflow: hidden;
		box-sizing: border-box;
	}

	.alt-field {
		position: relative;
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 0;
		margin: 0;
		padding: 0;
		padding-right: 22px;
		cursor: text;
	}

	.alt-faux-ph {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		pointer-events: none;
		z-index: 0;
		overflow: hidden;
		transition: color 0.12s ease;
	}

	.alt-faux-prefix {
		font-size: 14px;
		font-weight: 500;
		line-height: 32px;
		color: var(--white66);
		white-space: pre;
		flex-shrink: 0;
		transition: color 0.12s ease;
	}

	.alt-faux-dots {
		font-size: 14px;
		font-weight: 500;
		line-height: 32px;
		color: var(--white33);
		flex-shrink: 0;
		transition: color 0.12s ease;
	}

	.alt-faux-ph--focused .alt-faux-prefix,
	.alt-faux-ph--focused .alt-faux-dots {
		color: var(--white33);
	}

	.alt-input {
		flex: 1;
		min-width: 0;
		width: 0;
		height: 32px;
		padding: 0 4px 0 0;
		margin: 0;
		border: none;
		outline: none;
		background: transparent;
		font-size: 14px;
		font-weight: 500;
		line-height: 32px;
		color: var(--white);
		caret-color: var(--white);
		font-family: inherit;
		position: relative;
		z-index: 1;
	}

	.alt-triangle {
		flex-shrink: 0;
		display: block;
	}

	/* InputLabel-equivalent hairline on full silhouette (incl. triangle bump) */
	.alt-outline {
		position: absolute;
		left: 0;
		top: 0;
		pointer-events: none;
		z-index: 2;
		overflow: visible;
	}

	/* Far right of chip (~InputLabel margin-right 8px), mostly over triangle */
	.alt-chevron-btn {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 32px;
		padding: 0;
		margin: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		color: var(--white33);
		z-index: 3;
		transition: opacity 0.15s ease;
	}

	.alt-chevron-btn:hover {
		opacity: 0.85;
	}

	.alt-menu {
		position: fixed;
		z-index: 200;
		display: flex;
		flex-direction: column;
		padding: 0;
		background: var(--gray66);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border: 0.33px solid var(--white33);
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 8px 24px hsl(0 0% 0% / 0.25);
		box-sizing: border-box;
	}

	.alt-menu-list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	.alt-menu-item {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 10px 12px;
		text-align: left;
		font-size: 14px;
		font-weight: 500;
		font-family: var(--font-sans), 'Inter', sans-serif;
		color: var(--white);
		background: transparent;
		border: none;
		border-bottom: 0.33px solid var(--white8);
		cursor: pointer;
		transition: background-color 0.1s ease;
	}

	.alt-menu-item:last-child {
		border-bottom: none;
	}

	.alt-menu-item:hover {
		background: var(--white8);
	}

	.alt-menu-empty {
		padding: 14px 12px;
		font-size: 13px;
		font-weight: 500;
		color: var(--white33);
		text-align: center;
		line-height: 1.35;
	}
</style>
