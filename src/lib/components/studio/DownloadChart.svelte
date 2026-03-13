<script module>
	// Computed once at module load — outside any reactive/component context
	const _MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
	const _DAYS = 30;

	// These are one-time label strings, not reactive state — safe to suppress here
	/* eslint-disable svelte/prefer-svelte-reactivity */
	export const DAY_LABELS = Array.from({ length: _DAYS }, (_, i) => {
		const d = new Date();
		d.setDate(d.getDate() - (_DAYS - 1 - i));
		return `${d.getDate()} ${_MONTHS[d.getMonth()]}`;
	});
	/* eslint-enable svelte/prefer-svelte-reactivity */
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
		seedA = 1.2,
		seedB = 3.1
	} = $props();

	const DAYS = _DAYS;

	function wave(i, seed, base, amp) {
		const trend = (i / (DAYS - 1)) * amp * 1.5;
		const s1 = Math.sin(i * 0.9 + seed) * amp * 0.3;
		const s2 = Math.sin(i * 2.5 + seed * 1.4) * amp * 0.18;
		const s3 = Math.sin(i * 0.4 + seed * 2.1) * amp * 0.22;
		return Math.max(2, Math.round(base * 0.4 + trend + s1 + s2 + s3));
	}

	const apps = [
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
	];

	const totalData = Array.from({ length: DAYS }, (_, i) =>
		apps.reduce((sum, a) => sum + a.data[i], 0)
	);

	const maxY = Math.max(...totalData);

	const dateLabel = DAY_LABELS[DAYS - 1];

	// Layout constants
	const H = 168;
	const PAD_T = 40;
	const PAD_B = 0;
	const RIGHT_ZONE = 14;
	const BADGE_H = 24;
	const BADGE_GAP = 4;

	let containerEl = $state(null);
	let W = $state(600);
	let hoverIndex = $state(null);

	$effect(() => {
		if (!containerEl) return;
		W = containerEl.clientWidth || 600;
		// eslint-disable-next-line no-undef
		const ro = new ResizeObserver(([e]) => (W = e.contentRect.width));
		ro.observe(containerEl);
		return () => ro.disconnect();
	});

	// Badge width: ~8px per char + 18px padding
	function bw(val) {
		return String(val).length * 8 + 18;
	}

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
		sorted.forEach((it) => {
			it.y = Math.max(PAD_T + half, Math.min(H - PAD_B - half, it.y));
		});
		return sorted;
	}

	// All chart geometry derived from W
	const chart = $derived.by(() => {
		const cW = W - RIGHT_ZONE;
		const cH = H - PAD_T - PAD_B;

		function xp(i) { return (i / (DAYS - 1)) * cW; }
		function yp(v) { return PAD_T + cH - (v / maxY) * cH; }

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
			appPaths: apps.map((a) => buildPath(a.data)),
			totalEndY,
			appEndYs: apps.map((a) => yp(a.data[DAYS - 1]))
		};
	});

	// Hover crosshair geometry — snapped to nearest data index
	const hover = $derived.by(() => {
		if (hoverIndex === null) return null;
		const cW = W - RIGHT_ZONE;
		const cH = H - PAD_T - PAD_B;

		function xp(i) { return (i / (DAYS - 1)) * cW; }
		function yp(v) { return PAD_T + cH - (v / maxY) * cH; }

		const x = xp(hoverIndex);
		const totalVal = totalData[hoverIndex];
		const totalY = yp(totalVal);
		const appVals = apps.map((a) => a.data[hoverIndex]);
		const appYs = apps.map((_, i) => yp(appVals[i]));

		const dateStr = DAY_LABELS[hoverIndex];

		// Flip badges to left when they would overflow the chart right edge
		const maxBW = Math.max(...appVals.map(bw), bw(totalVal));
		const badgeLeft = x + 10 + maxBW > cW;

		// De-overlapped badge Y positions (badges nudged; icons stay at data Y)
		const rawItems = [
			{ key: 'total', y: totalY },
			...appYs.map((y, i) => ({ key: `app-${i}`, y }))
		];
		const adjusted = deoverlap(rawItems);
		const totalBadgeY = adjusted.find((it) => it.key === 'total')?.y ?? totalY;
		const appBadgeYs = appYs.map((_, i) => adjusted.find((it) => it.key === `app-${i}`)?.y ?? appYs[i]);

		return { x, totalVal, totalY, totalBadgeY, appVals, appYs, appBadgeYs, dateStr, badgeLeft };
	});

	// Clamped x for the date pill — avoids overflowing container edges
	const datePillX = $derived(hover !== null ? Math.max(36, Math.min(W - 36, hover.x)) : null);

	function handleMouseMove(event) {
		const rect = event.currentTarget.getBoundingClientRect();
		const mouseX = event.clientX - rect.left;
		const cW = W - RIGHT_ZONE;
		hoverIndex = Math.max(0, Math.min(DAYS - 1, Math.round((mouseX / cW) * (DAYS - 1))));
	}

	function handleMouseLeave() {
		hoverIndex = null;
	}

	function badgeRectX(x, val, left) {
		return left ? x - 10 - bw(val) : x + 10;
	}
	function badgeTextX(x, val, left) {
		return left ? x - 10 - bw(val) / 2 : x + 10 + bw(val) / 2;
	}
</script>

<div class="chart-wrap" bind:this={containerEl}>
	{#if W > 0}
		<svg
			class="chart-svg"
			width={W}
			height={H}
			viewBox="0 0 {W} {H}"
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

			<!-- Static end-line clip paths -->
			{#each apps as app, i (app.id)}
				<clipPath id="{chartId}-clip-{i}">
					<rect
						x={chart.lineX - 6}
						y={chart.appEndYs[i] - 6}
						width="12"
						height="12"
						rx="4"
						ry="4"
					/>
				</clipPath>
			{/each}

			<!-- Hover clip paths (recomputed on mouse move) -->
			{#if hover !== null}
				{#each apps as app, i (app.id)}
					<clipPath id="{chartId}-clip-h-{i}">
						<rect
							x={hover.x - 6}
							y={hover.appYs[i] - 6}
							width="12"
							height="12"
							rx="4"
							ry="4"
						/>
					</clipPath>
				{/each}
			{/if}
		</defs>

		<!-- Per-app lines (white/16) -->
		{#each chart.appPaths as path, i (i)}
			<path d={path} stroke="rgba(255,255,255,0.16)" stroke-width="1.4" fill="none" />
		{/each}

		<!-- Total line glow layer -->
		<path
			d={chart.totalPath}
			stroke={glowColor}
			stroke-width="6"
			fill="none"
			filter="url(#{chartId}-glow)"
			opacity={glowOpacity}
		/>

		<!-- Total line (gradient, crisp) -->
		<path d={chart.totalPath} stroke="url(#{chartId}-line)" stroke-width="2.8" fill="none" />

		<!-- Static vertical end line — always visible -->
		<line
			x1={chart.lineX}
			y1={PAD_T}
			x2={chart.lineX}
			y2={H - PAD_B}
			stroke="rgba(255,255,255,0.1)"
			stroke-width="1"
		/>

		<!-- Static end markers — hidden while hover is active -->
		{#if hover === null}
			{#each apps as app, i (app.id)}
				<image
					href={app.icon}
					x={chart.lineX - 6}
					y={chart.appEndYs[i] - 6}
					width="12"
					height="12"
					clip-path="url(#{chartId}-clip-{i})"
					preserveAspectRatio="xMidYMid slice"
				/>
			{/each}
			<circle cx={chart.lineX} cy={chart.totalEndY} r="6" fill={dotColor} />
		{/if}

		<!-- ── Hover crosshair ──────────────────────────────────────────────── -->
		{#if hover !== null}
			<!-- Hover vertical line -->
			<line
				x1={hover.x}
				y1={PAD_T}
				x2={hover.x}
				y2={H - PAD_B}
				stroke="rgba(255,255,255,0.22)"
				stroke-width="1"
				pointer-events="none"
			/>

			<!-- App icons + value badges (badge Y is de-overlapped) -->
			{#each apps as app, i (app.id)}
				<image
					href={app.icon}
					x={hover.x - 6}
					y={hover.appYs[i] - 6}
					width="12"
					height="12"
					clip-path="url(#{chartId}-clip-h-{i})"
					preserveAspectRatio="xMidYMid slice"
					pointer-events="none"
				/>
				<rect
					x={badgeRectX(hover.x, hover.appVals[i], hover.badgeLeft)}
					y={hover.appBadgeYs[i] - BADGE_H / 2}
					width={bw(hover.appVals[i])}
					height={BADGE_H}
					rx="6"
					fill="rgba(0,0,0,0.82)"
					stroke="rgba(255,255,255,0.14)"
					stroke-width="0.5"
					pointer-events="none"
				/>
				<text
					x={badgeTextX(hover.x, hover.appVals[i], hover.badgeLeft)}
					y={hover.appBadgeYs[i]}
					text-anchor="middle"
					dominant-baseline="middle"
					font-size="12"
					font-weight="600"
					font-family="inherit"
					fill="white"
					pointer-events="none"
				>{hover.appVals[i]}</text>
			{/each}

			<!-- Total dot -->
			<circle cx={hover.x} cy={hover.totalY} r="6" fill={dotColor} pointer-events="none" />

			<!-- Total value badge (de-overlapped Y) -->
			<rect
				x={badgeRectX(hover.x, hover.totalVal, hover.badgeLeft)}
				y={hover.totalBadgeY - BADGE_H / 2}
				width={bw(hover.totalVal)}
				height={BADGE_H}
				rx="6"
				fill="rgba(0,0,0,0.82)"
				stroke="rgba(255,255,255,0.22)"
				stroke-width="0.5"
				pointer-events="none"
			/>
			<text
				x={badgeTextX(hover.x, hover.totalVal, hover.badgeLeft)}
				y={hover.totalBadgeY}
				text-anchor="middle"
				dominant-baseline="middle"
				font-size="12"
				font-weight="600"
				font-family="inherit"
				fill="white"
				pointer-events="none"
			>{hover.totalVal}</text>
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
		height: 20px;
		margin-top: 0;
	}

	.date-pill {
		position: absolute;
		right: 0;
		height: 20px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		display: inline-flex;
		align-items: center;
		padding: 0 10px;
		font-size: 10px;
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
