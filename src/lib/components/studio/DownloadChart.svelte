<script module>
	const _MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	/** @param {number} n */
	export function buildDayLabels(n) {
		const days = Math.max(1, n);
		/* eslint-disable svelte/prefer-svelte-reactivity -- axis labels; local Date, not component state */
		return Array.from({ length: days }, (_, i) => {
			const d = new Date();
			d.setDate(d.getDate() - (days - 1 - i));
			return `${d.getDate()} ${_MONTHS[d.getMonth()]}`;
		});
		/* eslint-enable svelte/prefer-svelte-reactivity */
	}
</script>

<script>
	// Color props — blurple defaults, override for gold/etc.
	let {
		chartId = 'dcg',
		color0 = '#5445FF',
		color1 = '#636AFF',
		glowColor = '#5445FF',
		glowOpacity = 0.3,
		dotColor = '#5C5FFF',
		badgeBg = 'rgba(60,58,80,0.92)',
		seedA = 1.2,
		seedB = 3.1,
		// Real data: array of { id, name, icon, counts: number[] } aligned to DAY_LABELS.
		// null = dummy mode — chart generates wave data from seedA / seedB.
		appData = null,
		// Per-app line colors. When provided, each app line uses its color at full weight
		// instead of faint white, and the total line is hidden.
		// e.g. ['#636AFF', '#FFB237'] for downloads + zaps.
		appColors = null,
		// Per-app hover badge backgrounds, parallel to appColors.
		// Falls back to badgeBg when not provided.
		appBadgeBgs = null,
		// Hide the combined total line (useful when appColors makes individual lines primary).
		hideTotalLine = false,
		// Override top padding (default 40). Use 20 for compact layouts.
		padTop = 40,
		/** Number of days on the X axis (must match each `counts` length when appData is set). */
		dayCount = 30,
		/** When true, line-end / hover markers use the impressions eye glyph instead of app images. */
		useImpressionMarkers = false,
		/** Pixels below the y=0 baseline (inside SVG). Vertical rule extends through this band; data is not clipped there. */
		padBottom = 12,
		/**
		 * Cap faint per-app lines (plus their markers / hover badges) to the top N apps by series total.
		 * The bold total line always sums every app in `appData`. `null` = show all per-app lines (default).
		 */
		maxPerAppLines = null
	} = $props();

	const DAYS = $derived(Math.max(1, dayCount));
	const xDenom = $derived(Math.max(1, DAYS - 1));
	const dayLabels = $derived(buildDayLabels(DAYS));

	function alignCounts(/** @type {number[] | undefined} */ counts, /** @type {number} */ n) {
		if (!counts?.length) return Array(n).fill(0);
		if (counts.length === n) return counts;
		if (counts.length > n) return counts.slice(-n);
		return [...Array(n - counts.length).fill(0), ...counts];
	}

	// Used only when appData is null (dummy/fallback mode).
	function wave(i, seed, base, amp) {
		const trend = (i / xDenom) * amp * 1.5;
		const s1 = Math.sin(i * 0.9 + seed) * amp * 0.3;
		const s2 = Math.sin(i * 2.5 + seed * 1.4) * amp * 0.18;
		const s3 = Math.sin(i * 0.4 + seed * 2.1) * amp * 0.22;
		return Math.max(2, Math.round(base * 0.4 + trend + s1 + s2 + s3));
	}

	// Reactive: re-derives whenever appData prop changes.
	const allApps = $derived(
		appData
			? appData.map((a) => ({
					id: a.id,
					name: a.name,
					icon: a.icon,
					data: alignCounts(a.counts, DAYS)
				}))
			: [
					{
						id: 'app-a',
						name: 'App A',
						icon: '/images/parallax-apps/newpipe.png',
						data: Array.from({ length: DAYS }, (_, i) => wave(i, seedA, 68, 42))
					},
					{
						id: 'app-b',
						name: 'App B',
						icon: '/images/parallax-apps/primal.png',
						data: Array.from({ length: DAYS }, (_, i) => wave(i, seedB, 36, 24))
					}
				]
	);

	function seriesTotal(/** @type {{ data: number[] }} */ a) {
		return a.data.reduce((s, v) => s + v, 0);
	}

	/** Subset of allApps drawn as faint per-app lines (total still uses all apps). */
	const lineApps = $derived.by(() => {
		const list = allApps;
		const cap = maxPerAppLines;
		if (cap == null || cap < 1 || list.length <= 1) return list;
		const sorted = [...list].sort((a, b) => seriesTotal(b) - seriesTotal(a));
		return sorted.slice(0, Math.min(cap, sorted.length));
	});

	const totalData = $derived(
		Array.from({ length: DAYS }, (_, i) => allApps.reduce((sum, a) => sum + a.data[i], 0))
	);

	const maxY = $derived(Math.max(1, ...totalData));

	const dateLabel = $derived(dayLabels[DAYS - 1]);

	/** Single-app line: use dot when no icon (e.g. aggregated “all apps” series). */
	const singleAppUseDot = $derived(
		allApps.length === 1 && !useImpressionMarkers && !appColors && !String(allApps[0]?.icon ?? '').trim()
	);

	/** Y coordinate of v=0 (plot floor). Chart curves stay above this; padBottom sits below. */
	const PLOT_FLOOR_Y = 168;
	const SVG_H = $derived(PLOT_FLOOR_Y + padBottom);
	const PAD_T = $derived(padTop);
	const RIGHT_ZONE = 14;
	const BADGE_H = 24;
	const BADGE_GAP = 4;

	let containerEl = $state(null);
	let W = $state(600);
	let hoverIndex = $state(null);

	$effect(() => {
		if (!containerEl) return;
		W = containerEl.clientWidth || 600;
		const ro = new ResizeObserver(([e]) => (W = e.contentRect.width));
		ro.observe(containerEl);
		return () => ro.disconnect();
	});

	// Fixed badge width — large enough for any 3-digit count
	const BADGE_W = 44;

	// Push-apart: prevent badge labels from overlapping.
	// Items are [{key, y}]. Returns new objects — originals untouched.
	function deoverlap(items) {
		const sorted = items.map((it) => ({ ...it })).sort((a, b) => a.y - b.y);
		const minGap = BADGE_H + BADGE_GAP;
		for (let pass = 0; pass < 4; pass++) {
			for (let i = 1; i < sorted.length; i++) {
				const gap = sorted[i].y - sorted[i - 1].y;
				if (gap < minGap) {
					const push = (minGap - gap) / 2;
					sorted[i - 1].y -= push;
					sorted[i].y += push;
				}
			}
		}
		const half = BADGE_H / 2;
		const yMax = PLOT_FLOOR_Y + padBottom - half;
		sorted.forEach((it) => {
			it.y = Math.max(PAD_T + half, Math.min(yMax, it.y));
		});
		return sorted;
	}

	// All chart geometry derived from W
	const chart = $derived.by(() => {
		const cW = W - RIGHT_ZONE;
		const cH = PLOT_FLOOR_Y - PAD_T;

		function xp(i) {
			return (i / xDenom) * cW;
		}
		function yp(v) {
			return PAD_T + cH - (v / maxY) * cH;
		}

		function buildPath(data) {
			const pts = data.map((v, i) => [xp(i), yp(v)]);
			let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
			for (let i = 1; i < pts.length; i++) {
				const cpx = ((pts[i - 1][0] + pts[i][0]) / 2).toFixed(2);
				d += ` C ${cpx} ${pts[i - 1][1].toFixed(2)} ${cpx} ${pts[i][1].toFixed(2)} ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
			}
			return d;
		}

		const lineX = xp(DAYS - 1);
		const totalEndY = yp(totalData[DAYS - 1]);

		return {
			lineX,
			totalPath: buildPath(totalData),
			appPaths: lineApps.map((a) => buildPath(a.data)),
			totalEndY,
			appEndYs: lineApps.map((a) => yp(a.data[DAYS - 1]))
		};
	});

	// Hover crosshair geometry — snapped to nearest data index
	const hover = $derived.by(() => {
		if (hoverIndex === null) return null;
		const cW = W - RIGHT_ZONE;
		const cH = PLOT_FLOOR_Y - PAD_T;

		function xp(i) {
			return (i / xDenom) * cW;
		}
		function yp(v) {
			return PAD_T + cH - (v / maxY) * cH;
		}

		const x = xp(hoverIndex);
		const totalVal = totalData[hoverIndex];
		const totalY = yp(totalVal);
		const appVals = lineApps.map((a) => a.data[hoverIndex]);
		const appYs = appVals.map((v) => yp(v));

		const dateStr = dayLabels[hoverIndex];

		// Flip badges to left when they would overflow the chart right edge
		const badgeLeft = x + 10 + BADGE_W > cW;

		// De-overlapped badge Y positions (badges nudged; icons stay at data Y)
		const rawItems = [
			{ key: 'total', y: totalY },
			...appYs.map((y, i) => ({ key: `app-${i}`, y }))
		];
		const adjusted = deoverlap(rawItems);
		const totalBadgeY = adjusted.find((it) => it.key === 'total')?.y ?? totalY;
		const appBadgeYs = appYs.map((_, i) => adjusted.find((it) => it.key === `app-${i}`)?.y ?? appYs[i]);

		// Top of the hover line: topmost visible line
		const lineTopY = hideTotalLine ? Math.min(...appYs) : totalY;

		return { x, totalVal, totalY, totalBadgeY, appVals, appYs, appBadgeYs, dateStr, badgeLeft, lineTopY };
	});

	// Clamped x for the date pill — avoids overflowing container edges
	const datePillX = $derived(hover !== null ? Math.max(36, Math.min(W - 36, hover.x)) : null);

	function handleMouseMove(event) {
		const rect = event.currentTarget.getBoundingClientRect();
		const mouseX = event.clientX - rect.left;
		const cW = W - RIGHT_ZONE;
		hoverIndex = Math.max(0, Math.min(DAYS - 1, Math.round((mouseX / cW) * xDenom)));
	}

	function handleMouseLeave() {
		hoverIndex = null;
	}

	function badgeRectX(x, left) {
		return left ? x - 10 - BADGE_W : x + 10;
	}
	function badgeTextX(x, left) {
		return left ? x - 10 - BADGE_W / 2 : x + 10 + BADGE_W / 2;
	}
</script>

<div class="chart-wrap" bind:this={containerEl}>
	{#if W > 0}
		<svg
			class="chart-svg"
			width={W}
			height={SVG_H}
			viewBox="0 0 {W} {SVG_H}"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
			overflow="visible"
			onmousemove={handleMouseMove}
			onmouseleave={handleMouseLeave}
		>
		<defs>
			<linearGradient
				id="{chartId}-line"
				x1="0"
				y1="0"
				x2={chart.lineX}
				y2="0"
				gradientUnits="userSpaceOnUse"
			>
				<stop offset="0%" stop-color={color0} />
				<stop offset="100%" stop-color={color1} />
			</linearGradient>

			<filter id="{chartId}-glow" x="-20%" y="-250%" width="140%" height="600%">
				<feGaussianBlur in="SourceGraphic" stdDeviation="9" />
			</filter>
		</defs>

		<!-- Per-app lines — multi-app only; at most maxPerAppLines (see lineApps) -->
		{#if allApps.length > 1 && lineApps.length > 0}
			{#if appColors}
				<!-- Glow + crisp line per app (same line+glow style as insights section) -->
				{#each chart.appPaths as path, i (i)}
					{@const lineColor = appColors[i] ?? dotColor}
					<path
						d={path}
						stroke={lineColor}
						stroke-width="6"
						fill="none"
						filter="url(#{chartId}-glow)"
						opacity={glowOpacity}
					/>
					<path d={path} stroke={lineColor} stroke-width="2.8" fill="none" />
				{/each}
			{:else}
				{#each chart.appPaths as path, i (i)}
					{@const lineColor = appColors?.[i] ?? 'rgba(255,255,255,0.16)'}
					{@const lineWidth = appColors ? '2' : '1.4'}
					<path d={path} stroke={lineColor} stroke-width={lineWidth} fill="none" />
				{/each}
			{/if}
		{/if}

		<!-- Total line glow + crisp — hidden when hideTotalLine -->
		{#if !hideTotalLine}
			<path
				d={chart.totalPath}
				stroke={glowColor}
				stroke-width="6"
				fill="none"
				filter="url(#{chartId}-glow)"
				opacity={glowOpacity}
			/>
			<path d={chart.totalPath} stroke="url(#{chartId}-line)" stroke-width="2.8" fill="none" />
		{/if}

		<!-- Static vertical end line — always visible -->
		<line
			x1={chart.lineX}
			y1={PAD_T}
			x2={chart.lineX}
			y2={SVG_H}
			stroke="rgba(255,255,255,0.1)"
			stroke-width="1"
		/>

		<!-- Static end markers — hidden while hover is active -->
		{#if hover === null}
			{#if allApps.length === 1}
				{#if appColors}
					<circle cx={chart.lineX} cy={chart.totalEndY} r="5" fill={appColors[0]} />
				{:else if useImpressionMarkers}
					<circle cx={chart.lineX} cy={chart.totalEndY} r="6" fill="url(#{chartId}-line)" />
				{:else if singleAppUseDot}
					<circle cx={chart.lineX} cy={chart.totalEndY} r="6" fill={dotColor} />
				{:else}
					<image
						href={allApps[0].icon}
						x={chart.lineX - 6}
						y={chart.totalEndY - 6}
						width="12"
						height="12"
						preserveAspectRatio="xMidYMid meet"
					/>
				{/if}
			{:else}
				{#each lineApps as app, i (app.id)}
					{#if appColors}
						<circle cx={chart.lineX} cy={chart.appEndYs[i]} r="5" fill={appColors[i] ?? dotColor} />
					{:else if useImpressionMarkers}
						<circle cx={chart.lineX} cy={chart.appEndYs[i]} r="5" fill="url(#{chartId}-line)" />
					{:else}
						<image
							href={app.icon}
							x={chart.lineX - 6}
							y={chart.appEndYs[i] - 6}
							width="12"
							height="12"
							preserveAspectRatio="xMidYMid meet"
						/>
					{/if}
				{/each}
				{#if !hideTotalLine}
					<circle
						cx={chart.lineX}
						cy={chart.totalEndY}
						r="6"
						fill={useImpressionMarkers ? `url(#${chartId}-line)` : dotColor}
					/>
				{/if}
			{/if}
		{/if}

		<!-- ── Hover crosshair ──────────────────────────────────────────────── -->
		{#if hover !== null}
			<!-- Hover vertical line — starts at topmost visible line -->
			<line
				x1={hover.x}
				y1={hover.lineTopY}
				x2={hover.x}
				y2={SVG_H}
				stroke="rgba(255,255,255,0.22)"
				stroke-width="1"
				pointer-events="none"
			/>

			{#if allApps.length === 1}
				<!-- Single app: dot or icon + one badge -->
				{#if appColors}
					<circle cx={hover.x} cy={hover.totalY} r="5" fill={appColors[0]} pointer-events="none" />
				{:else if useImpressionMarkers}
					<circle
						cx={hover.x}
						cy={hover.totalY}
						r="6"
						fill="url(#{chartId}-line)"
						pointer-events="none"
					/>
				{:else if singleAppUseDot}
					<circle
						cx={hover.x}
						cy={hover.totalY}
						r="6"
						fill={dotColor}
						pointer-events="none"
					/>
				{:else}
					<image
						href={allApps[0].icon}
						x={hover.x - 6}
						y={hover.totalY - 6}
						width="12"
						height="12"
						preserveAspectRatio="xMidYMid meet"
						pointer-events="none"
					/>
				{/if}
				<rect
					x={badgeRectX(hover.x, hover.badgeLeft)}
					y={hover.totalY - BADGE_H / 2}
					width={BADGE_W}
					height={BADGE_H}
					rx="6"
					fill={badgeBg}
					pointer-events="none"
				/>
				<text
					x={badgeTextX(hover.x, hover.badgeLeft)}
					y={hover.totalY}
					text-anchor="middle"
					dominant-baseline="middle"
					font-size="12"
					font-weight="800"
					font-family="inherit"
					fill="white"
					pointer-events="none"
				>{hover.totalVal}</text>
			{:else}
				<!-- Multi-app: per-app dots/icons + badges (lineApps only) -->
				{#each lineApps as app, i (app.id)}
					{#if appColors}
						<circle cx={hover.x} cy={hover.appYs[i]} r="5" fill={appColors[i] ?? dotColor} pointer-events="none" />
					{:else if useImpressionMarkers}
						<circle
							cx={hover.x}
							cy={hover.appYs[i]}
							r="5"
							fill="url(#{chartId}-line)"
							pointer-events="none"
						/>
					{:else}
						<image
							href={app.icon}
							x={hover.x - 6}
							y={hover.appYs[i] - 6}
							width="12"
							height="12"
							preserveAspectRatio="xMidYMid meet"
							pointer-events="none"
						/>
					{/if}
					<rect
						x={badgeRectX(hover.x, hover.badgeLeft)}
						y={hover.appBadgeYs[i] - BADGE_H / 2}
						width={BADGE_W}
						height={BADGE_H}
						rx="6"
						fill={appBadgeBgs ? (appBadgeBgs[i] ?? badgeBg) : (appColors ? `${appColors[i]}22` : badgeBg)}
						pointer-events="none"
					/>
					<text
						x={badgeTextX(hover.x, hover.badgeLeft)}
						y={hover.appBadgeYs[i]}
						text-anchor="middle"
						dominant-baseline="middle"
						font-size="12"
						font-weight={appBadgeBgs ? '800' : (appColors ? '600' : '400')}
						font-family="inherit"
						fill={appBadgeBgs ? 'white' : (appColors ? (appColors[i] ?? 'white') : 'rgba(255,255,255,0.66)')}
						pointer-events="none"
					>{hover.appVals[i]}</text>
				{/each}

				<!-- Total dot + badge — only when not hidden -->
				{#if !hideTotalLine}
					<circle
						cx={hover.x}
						cy={hover.totalY}
						r="6"
						fill={useImpressionMarkers ? `url(#${chartId}-line)` : dotColor}
						pointer-events="none"
					/>
					<rect
						x={badgeRectX(hover.x, hover.badgeLeft)}
						y={hover.totalBadgeY - BADGE_H / 2}
						width={BADGE_W}
						height={BADGE_H}
						rx="6"
						fill={badgeBg}
						pointer-events="none"
					/>
					<text
						x={badgeTextX(hover.x, hover.badgeLeft)}
						y={hover.totalBadgeY}
						text-anchor="middle"
						dominant-baseline="middle"
						font-size="12"
						font-weight="800"
						font-family="inherit"
						fill="white"
						pointer-events="none"
					>{hover.totalVal}</text>
				{/if}
			{/if}
		{/if}
		</svg>

		<!-- Date row: fixed height, pill slides within it — no layout shift ever -->
		<div class="date-row">
			<div
				class="date-pill"
				class:date-pill-hover={hover !== null}
				style={datePillX !== null ? `left: ${datePillX}px;` : ''}
			>
				{hover !== null ? hover.dateStr : dateLabel}
			</div>
		</div>
	{/if}
</div>

<style>
	.chart-wrap {
		width: 100%;
		position: relative;
		overflow: visible;
	}

	.chart-svg {
		display: block;
		mask-image: linear-gradient(to right, transparent 0px, black 12px);
		-webkit-mask-image: linear-gradient(to right, transparent 0px, black 12px);
		cursor: crosshair;
	}

	/* Fixed-height row — pill slides inside via absolute positioning */
	.date-row {
		position: relative;
		height: 26px;
		margin-top: 0;
	}

	.date-pill {
		position: absolute;
		right: 0;
		height: 26px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		display: inline-flex;
		align-items: center;
		padding: 0 12px;
		font-size: 12px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.33);
		white-space: nowrap;
		line-height: 1;
	}

	/* Hover state: un-pin from right, center on hover line, white text */
	.date-pill.date-pill-hover {
		right: auto;
		transform: translateX(-50%);
		color: white;
		pointer-events: none;
	}
</style>
