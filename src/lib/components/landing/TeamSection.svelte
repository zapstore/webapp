<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { nip19 } from 'nostr-tools';
	import LandingSectionTitle from './LandingSectionTitle.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import Modal from '$lib/components/common/Modal.svelte';
	import { Zap, Send } from '$lib/components/icons';
	import { fetchZapReceiptsByPubkeys, parseZapReceipt, fetchProfile } from '$lib/nostr';
	import { DEFAULT_SOCIAL_RELAYS } from '$lib/config';
	import {
		hexToColor,
		stringToColor,
		getProfileTextColor,
		rgbToCssString
	} from '$lib/utils/color.js';

	const ZAPSTORE_NPUB = 'npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8';
	const FRAN_NPUB = 'npub1wf4pufsucer5va8g9p0rj5dnhvfeh6d8w0g6eayaep5dhps6rsgs43dgh9';
	const ZAPPER_SLOT_COUNT = 16;
	const THREE_MONTHS_SEC = 90 * 24 * 60 * 60;
	const ZAP_RECEIPTS_LIMIT = 3000;
	const ZAPSTORE_APP_NADDR =
		'/apps/naddr1qvzqqqr7pvpzq7xwd748yfjrsu5yuerm56fcn9tntmyv04w95etn0e23xrczvvraqqgxgetk9eaxzurnw3hhyefwv9c8qakg5jt';
	const FRAN_PRIMAL_URL =
		'https://primal.net/p/npub1wf4pufsucer5va8g9p0rj5dnhvfeh6d8w0g6eayaep5dhps6rsgs43dgh9';
	const MAX_ZAPPER_NAME_LEN = 16;
	const DONATE_ICON_SIZE = 44;

	// Center profiles (Pip, Fran, Elsat, Opensats) – excluded from top zappers, link to profile
	const CENTER_NPUBS = [
		{ name: 'Pip', npub: 'npub176p7sup477k5738qhxx0hk2n0cty2k5je5uvalzvkvwmw4tltmeqw7vgup' },
		{ name: 'Fran', npub: 'npub1wf4pufsucer5va8g9p0rj5dnhvfeh6d8w0g6eayaep5dhps6rsgs43dgh9' },
		{ name: 'Elsat', npub: 'npub1zafcms4xya5ap9zr7xxr0jlrtrattwlesytn2s42030lzu0dwlzqpd26k5' },
		{ name: 'Opensats', npub: 'npub10pensatlcfwktnvjjw2dtem38n6rvw8g6fv73h84cuacxn4c28eqyfn34f' }
	];
	const excludedPubkeys = new Set(
		CENTER_NPUBS.map(({ npub }) => {
			try {
				const d = nip19.decode(npub);
				return d.type === 'npub' ? d.data : null;
			} catch {
				return null;
			}
		}).filter(Boolean)
	);

	/** @type {{ name: string | null; image: string | null; pubkey?: string }[]} */
	let topZappers = $state([]);
	let isLoading = $state(true);
	/** @type {Record<number, boolean>} - indices where profile image failed to load */
	let imageErrorByIndex = $state({});

	const BASE_PIC_SIZE = 120;
	const INITIAL_FONT_RATIO = 0.56;

	/** @param {{ name?: string | null; pubkey?: string }} member
	 * @returns {string} */
	function getMemberInitial(member) {
		const name = member.name?.trim() ?? '';
		if (!name || name.toLowerCase().startsWith('npub')) return '';
		return (name[0] ?? '').toString().toUpperCase();
	}

	/** @param {{ name?: string | null; pubkey?: string }} member
	 * @returns {{ bgStyle: string; textStyle: string }} */
	function getMemberColorStyles(member) {
		const isDark = true;
		const rgb = member.pubkey
			? hexToColor(member.pubkey)
			: member.name?.trim()
				? stringToColor(member.name)
				: { r: 128, g: 128, b: 128 };
		const bgStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.24)`;
		const textColor = getProfileTextColor(rgb, isDark);
		const textStyle = rgbToCssString(textColor);
		return { bgStyle, textStyle };
	}

	/** @param {number} i */
	function setImageError(i) {
		imageErrorByIndex = { ...imageErrorByIndex, [i]: true };
	}

	// Team members - proper grid where top/bottom rows are centered between middle row positions
	// Middle row x positions: 0, ±200, ±400, ±600, ±800
	// Top/Bottom row x positions: ±100, ±300, ±500, ±700 (midpoints)
	// Sizes scale down: 120 → 105 → 92 → 80 → 70
	const coreTeam = [
		// MIDDLE ROW (y: 0) - Franzap center, then extending left/right
		{
			name: 'Franzap',
			role: 'Founder',
			image: '/images/team-sprofiles/franzap.png',
			size: 120,
			x: 0,
			y: 0,
			blur: 0,
			opacity: 1,
			isZapperSlot: false,
			nameLoading: false,
			profileHref: '/profile/npub1wf4pufsucer5va8g9p0rj5dnhvfeh6d8w0g6eayaep5dhps6rsgs43dgh9'
		},
		{
			name: 'And Other Stuff',
			role: 'Incubation',
			image: '/images/team-sprofiles/andotherstuff.png',
			size: 105,
			x: -200,
			y: 0,
			blur: 0,
			opacity: 1,
			isZapperSlot: false,
			nameLoading: false,
			profileHref: '/profile/npub1t5u3wp5kj78jwnuphpf5mhx00nwwtfwq56d6j8atnu89gd454wcs6aj4c2'
		},
		{
			name: 'Freedom Tech Co.',
			role: 'Donor',
			image: '/images/team-sprofiles/ftc.jpg',
			size: 105,
			x: 200,
			y: 0,
			blur: 0,
			opacity: 1,
			isZapperSlot: false,
			nameLoading: false,
			profileHref: '/profile/npub1frdmtech5c3p6e8azwapy72tc289qeavr4mr9m55xl2nxae82r0sach4dd'
		},
		// TOP ROW (y: -175) - centered between middle row positions
		{
			name: 'Henrique',
			role: 'Mobile',
			image: '/images/team-sprofiles/henrique.png',
			size: 92,
			x: 300,
			y: -175,
			blur: 0.3,
			opacity: 0.92,
			isZapperSlot: false,
			nameLoading: false,
			profileHref: '/profile/npub1y3yqdp44vg62ys8anqnjpx6cfprl848ev4lsmx5h4mznyz3xft9sen050h'
		},
		{
			name: 'Pip',
			role: 'Backend',
			image: '/images/team-sprofiles/pip.png',
			size: 105,
			x: -100,
			y: -175,
			blur: 0,
			opacity: 1,
			isZapperSlot: false,
			nameLoading: false,
			profileHref: '/profile/npub176p7sup477k5738qhxx0hk2n0cty2k5je5uvalzvkvwmw4tltmeqw7vgup'
		},
		{
			name: 'Niel',
			role: 'Design',
			image: '/images/team-sprofiles/niel.png',
			size: 105,
			x: 100,
			y: -175,
			blur: 0,
			opacity: 1,
			isZapperSlot: false,
			nameLoading: false,
			profileHref: '/profile/npub149p5act9a5qm9p47elp8w8h3wpwn2d7s2xecw2ygnrxqp4wgsklq9g722q'
		},
		{
			name: 'Elsat',
			role: 'Support',
			image: '/images/team-sprofiles/elsat.png',
			size: 92,
			x: -300,
			y: -175,
			blur: 0.3,
			opacity: 0.92,
			isZapperSlot: false,
			nameLoading: false,
			profileHref: '/profile/npub1zafcms4xya5ap9zr7xxr0jlrtrattwlesytn2s42030lzu0dwlzqpd26k5'
		},

		// BOTTOM ROW (y: 175) - centered between middle row positions
		{
			name: 'Opensats',
			role: 'Donor',
			image: '/images/team-sprofiles/opensats.png',
			size: 100,
			x: -100,
			y: 175,
			blur: 0,
			opacity: 1,
			isZapperSlot: false,
			nameLoading: false,
			profileHref: '/profile/npub10pensatlcfwktnvjjw2dtem38n6rvw8g6fv73h84cuacxn4c28eqyfn34f'
		},
		{
			name: 'HRF',
			role: 'Donor',
			image: '/images/team-sprofiles/hrf.png',
			size: 100,
			x: 100,
			y: 175,
			blur: 0,
			opacity: 1,
			isZapperSlot: false,
			nameLoading: false,
			profileHref: '/profile/npub17xvf49kht23cddxgw92rvfktkd3vqvjgkgsdexh9847wl0927tqsrhc9as'
		}
	];

	// Top zapper slot positions (will be filled dynamically)
	const zapperSlots = [
		{ size: 92, x: -400, y: 0, blur: 0.3, opacity: 0.92 },
		{ size: 92, x: 400, y: 0, blur: 0.3, opacity: 0.92 },
		{ size: 80, x: -600, y: 0, blur: 0.7, opacity: 0.8 },
		{ size: 80, x: 600, y: 0, blur: 0.7, opacity: 0.8 },
		{ size: 70, x: -800, y: 0, blur: 1.2, opacity: 0.65 },
		{ size: 70, x: 800, y: 0, blur: 1.2, opacity: 0.65 },
		{ size: 80, x: -500, y: -175, blur: 0.7, opacity: 0.8 },
		{ size: 80, x: 500, y: -175, blur: 0.7, opacity: 0.8 },
		{ size: 70, x: -700, y: -175, blur: 1.2, opacity: 0.65 },
		{ size: 70, x: 700, y: -175, blur: 1.2, opacity: 0.65 },
		{ size: 88, x: -300, y: 175, blur: 0.4, opacity: 0.9 },
		{ size: 88, x: 300, y: 175, blur: 0.4, opacity: 0.9 },
		{ size: 76, x: -500, y: 175, blur: 0.8, opacity: 0.78 },
		{ size: 76, x: 500, y: 175, blur: 0.8, opacity: 0.78 },
		{ size: 66, x: -700, y: 175, blur: 1.3, opacity: 0.62 },
		{ size: 66, x: 650, y: 175, blur: 1.3, opacity: 0.62 }
	];

	const ZAPPER_PLACEHOLDER_COUNT = 16;
	const teamMembers = $derived(
		isLoading
			? [
					...coreTeam,
					...zapperSlots.slice(0, ZAPPER_PLACEHOLDER_COUNT).map((slot) => ({
						...slot,
						name: null,
						role: 'Top Zapper',
						image: null,
						isZapperSlot: true,
						nameLoading: true,
						profileHref: undefined
					}))
				]
			: [
					...coreTeam,
					...zapperSlots.map((slot, i) => {
						const z = topZappers[i];
						if (!z) {
							return {
								...slot,
								name: 'Anon',
								role: 'Top Zapper',
								image: null,
								isZapperSlot: true,
								nameLoading: false,
								pubkey: undefined,
								profileHref: undefined
							};
						}
						const rawName = z.name ?? '';
						const displayName =
							rawName.length > MAX_ZAPPER_NAME_LEN
								? rawName.slice(0, MAX_ZAPPER_NAME_LEN) + '...'
								: rawName;
						return {
							...slot,
							name: displayName,
							role: 'Top Zapper',
							image: z.image ?? null,
							isZapperSlot: true,
							nameLoading: false,
							pubkey: z.pubkey,
							profileHref: z.pubkey ? `/profile/${nip19.npubEncode(z.pubkey)}` : undefined
						};
					})
				]
	);

	// Recipient pubkeys for zap aggregation: Zapstore + all center profiles (Pip, Fran, Elsat, Opensats)
	const zapRecipientPubkeys = $derived(
		(() => {
			const out = [];
			try {
				const d = nip19.decode(ZAPSTORE_NPUB);
				if (d.type === 'npub') out.push(d.data);
			} catch {}
			for (const { npub } of CENTER_NPUBS) {
				try {
					const d = nip19.decode(npub);
					if (d.type === 'npub') out.push(d.data);
				} catch {}
			}
			return out;
		})()
	);

	if (browser) {
		onMount(async () => {
			isLoading = true;
			try {
				if (zapRecipientPubkeys.length === 0) return;

				const since = Math.floor(Date.now() / 1000) - THREE_MONTHS_SEC;
				const receipts = await fetchZapReceiptsByPubkeys(zapRecipientPubkeys, {
					since,
					limit: ZAP_RECEIPTS_LIMIT
				});

				const bySender = /** @type {Record<string, number>} */ ({});
				for (const event of receipts) {
					const parsed = parseZapReceipt(event);
					if (parsed.senderPubkey && parsed.amountSats > 0) {
						bySender[parsed.senderPubkey] =
							(bySender[parsed.senderPubkey] ?? 0) + parsed.amountSats;
					}
				}
				const sorted = Object.entries(bySender)
					.sort((a, b) => b[1] - a[1])
					.filter(([pubkey]) => !excludedPubkeys.has(pubkey))
					.slice(0, ZAPPER_SLOT_COUNT)
					.map(([pubkey]) => pubkey);

				const list = [];
				for (const pubkey of sorted) {
					let name = '';
					let image = null;
					try {
						const ev = await fetchProfile(pubkey);
						if (ev?.content) {
							const c = JSON.parse(ev.content);
							name =
								(c.display_name ?? c.name ?? '').trim() ||
								(c.nip05 ? String(c.nip05).split('@')[0] : '') ||
								'';
							image = c.picture && String(c.picture).trim() ? c.picture : null;
						}
					} catch {
						// keep name empty; we still show this zapper with pubkey-derived initial
					}
					list.push({ name, image, pubkey });
				}
				// Only include zappers with real identity (name or picture), no anons/empty
				topZappers = list.filter(
					(z) => (z.name && z.name.trim() && z.name !== 'Supporter') || z.image
				);
			} catch (err) {
				console.error('[TeamSection] Failed to load top zappers:', err);
			} finally {
				isLoading = false;
			}
		});
	} else {
		isLoading = false;
	}

	/** @type {HTMLButtonElement | undefined} */
	let donateButton;

	/** @param {MouseEvent} event */
	function handleDonateMouseMove(event) {
		if (!donateButton) return;
		const rect = donateButton.getBoundingClientRect();
		donateButton.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
		donateButton.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
	}

	let donateModalOpen = $state(false);

	function handleDonate() {
		donateModalOpen = true;
	}
</script>

<section class="relative border-t border-border/50 pt-8 sm:pt-12 lg:pt-16 pb-0 overflow-hidden">
	<LandingSectionTitle
		title="Behind it all"
		description="Meet the team, collaborators & donors who make Zapstore possible."
	/>

	<!-- Team spread display -->
	<div class="team-spread-container">
		<!-- Left gradient fade -->
		<div
			class="absolute left-0 top-0 bottom-0 w-16 sm:w-24 md:w-32 lg:w-48 xl:w-64 z-20 pointer-events-none"
			style="background: linear-gradient(to right, hsl(var(--background)) 0%, hsl(var(--background) / 0.8) 30%, hsl(var(--background) / 0.4) 60%, transparent 100%);"
		></div>

		<!-- Right gradient fade -->
		<div
			class="absolute right-0 top-0 bottom-0 w-16 sm:w-24 md:w-32 lg:w-48 xl:w-64 z-20 pointer-events-none"
			style="background: linear-gradient(to left, hsl(var(--background)) 0%, hsl(var(--background) / 0.8) 30%, hsl(var(--background) / 0.4) 60%, transparent 100%);"
		></div>

		<div class="team-spread-scaler">
			<div class="team-spread">
				{#each teamMembers as member, i}
					{@const scale = (member.size ?? 120) / BASE_PIC_SIZE}
					{@const initial = getMemberInitial(member)}
					{@const colors = getMemberColorStyles(member)}
					{@const showImg = member.image && !imageErrorByIndex[i]}
					{@const showInitial = initial && !showImg}
					<svelte:element
						this={member.profileHref ? 'a' : 'div'}
						href={member.profileHref}
						class="team-member"
						style="
              left: calc(50% + {member.x}px);
              top: calc(50% + {member.y}px);
              transform: translate(-50%, -50%) scale({scale});
              filter: blur({member.blur}px);
              opacity: {member.opacity};
            "
					>
						<!-- Profile pic - base 120px; image with letter fallback on error -->
						{#if member.isZapperSlot && member.nameLoading}
							<div class="profile-pic-skeleton">
								<SkeletonLoader />
							</div>
						{:else if showImg}
							<div class="profile-pic-wrap">
								<img
									src={member.image}
									alt={member.name ?? ''}
									class="profile-pic-img"
									onerror={() => setImageError(i)}
								/>
							</div>
						{:else if showInitial}
							<div
								class="profile-pic-initial"
								style="background-color: {colors.bgStyle}; color: {colors.textStyle}; --initial-font-size: {Math.round(
									BASE_PIC_SIZE * INITIAL_FONT_RATIO
								)}px;"
							>
								<span class="profile-pic-initial-letter">{initial}</span>
							</div>
						{:else}
							<div class="profile-pic-placeholder"></div>
						{/if}

						{#if (member.name != null && member.name !== '') || (member.isZapperSlot && member.role)}
							<div class="member-info">
								{#if member.isZapperSlot && member.nameLoading}
									<div class="member-name-skeleton">
										<SkeletonLoader />
									</div>
								{:else if member.name}
									<span class="member-name">{member.name}</span>
								{/if}
								{#if member.role}
									<span class="member-role">{member.role}</span>
								{/if}
							</div>
						{/if}
					</svelte:element>
				{/each}
			</div>
		</div>
	</div>

	<!-- Donate button anchored to bottom -->
	<button
		type="button"
		bind:this={donateButton}
		onclick={handleDonate}
		onmousemove={handleDonateMouseMove}
		class="donate-button-bottom btn-glass-small btn-glass-blurple-hover flex items-center justify-center"
	>
		<span class="btn-text-white">Donate to Zapstore</span>
	</button>
</section>

<Modal bind:open={donateModalOpen} ariaLabel="Donate to Zapstore" maxWidth="max-w-xl">
	<div class="donate-modal-content p-4 md:p-6">
		<!-- SVG gradient defs for donate panel icons (gray66, theme-aware) -->
		<svg aria-hidden="true" class="donate-modal-sr-only" focusable="false">
			<defs>
				<radialGradient id="donate-gray66-light" cx="0%" cy="0%" r="100%">
					<stop offset="0%" stop-color="rgb(255, 255, 255)" stop-opacity="0.66" />
					<stop offset="100%" stop-color="rgb(219, 219, 255)" stop-opacity="0.66" />
				</radialGradient>
				<radialGradient id="donate-gray66-dark" cx="0%" cy="0%" r="100%">
					<stop offset="0%" stop-color="rgb(87, 87, 117)" stop-opacity="0.66" />
					<stop offset="100%" stop-color="rgb(36, 36, 36)" stop-opacity="0.66" />
				</radialGradient>
			</defs>
		</svg>
		<h2 class="text-display text-4xl text-foreground text-center mb-6">Donate</h2>
		<div class="donate-modal-panels">
			<a href={ZAPSTORE_APP_NADDR} class="donate-panel">
				<div class="donate-panel-icon donate-panel-icon-zap">
					<Zap variant="fill" color="url(#donate-gray66-light)" size={DONATE_ICON_SIZE} />
				</div>
				<span class="donate-panel-title">Zap The App</span>
				<span class="donate-panel-desc">Zap the Zapstore app directly</span>
			</a>
			<a href={FRAN_PRIMAL_URL} target="_blank" rel="noopener noreferrer" class="donate-panel">
				<div class="donate-panel-icon donate-panel-icon-send">
					<Send variant="fill" color="url(#donate-gray66-light)" size={DONATE_ICON_SIZE} />
				</div>
				<span class="donate-panel-title">Contact Us</span>
				<span class="donate-panel-desc">For bigger donations</span>
			</a>
		</div>
	</div>
</Modal>

<style>
	.team-spread-container {
		position: relative;
		overflow: hidden;
		margin-top: -12px;
		padding-bottom: 72px;
	}

	/* Scaler wrapper - keeps height mostly consistent, allows horizontal clipping */
	.team-spread-scaler {
		--scale: 0.94;
		width: 100%;
		height: 520px;
		display: flex;
		justify-content: center;
		align-items: center;
		overflow: visible;
	}

	.team-spread {
		position: relative;
		width: 1600px;
		height: 540px;
		flex-shrink: 0;
		transform: scale(var(--scale));
		transform-origin: center center;
	}

	.team-member {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		transform-origin: center center;
	}

	/* Base size 120px - scaled via transform */
	.profile-pic-wrap,
	.profile-pic-initial,
	.profile-pic-placeholder {
		width: 120px;
		height: 120px;
		border-radius: 50%;
		border: 2px solid hsl(var(--white8));
		flex-shrink: 0;
	}

	.profile-pic-wrap {
		overflow: hidden;
		position: relative;
	}

	.profile-pic-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.profile-pic-initial {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.profile-pic-initial-letter {
		font-size: var(--initial-font-size, 67px);
		font-weight: 700;
		line-height: 1;
		user-select: none;
	}

	.profile-pic-placeholder {
		background-color: hsl(var(--gray66));
	}

	.profile-pic-skeleton {
		width: 120px;
		height: 120px;
		border-radius: 50%;
		overflow: hidden;
		border: 2px solid hsl(var(--white8));
		flex-shrink: 0;
		background-color: hsl(var(--gray66));
	}

	.profile-pic-img {
		opacity: 0.9;
		transition: opacity 0.2s ease;
	}

	.team-member:hover .profile-pic-img {
		opacity: 1;
	}

	.member-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 2px;
		width: 160px;
	}

	.team-member[href] {
		text-decoration: none;
		color: inherit;
	}

	.member-name-skeleton {
		width: 100px;
		height: 1.25rem;
		border-radius: 0.75rem;
		overflow: hidden;
		flex-shrink: 0;
	}

	.member-name {
		font-size: 1.25rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		white-space: nowrap;
	}

	.member-role {
		font-size: 1rem;
		font-weight: 500;
		color: hsl(var(--white66));
		white-space: nowrap;
	}

	.donate-button-bottom {
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		z-index: 20;
		height: 48px !important;
		width: 360px !important;
		padding-bottom: 1px !important;
		font-size: 1rem;
		background-color: rgb(0 0 0 / 0.33) !important;
		border-top-left-radius: 24px !important;
		border-top-right-radius: 24px !important;
		border-bottom-left-radius: 0 !important;
		border-bottom-right-radius: 0 !important;
		border-bottom: none !important;
	}

	.donate-button-bottom:hover {
		transform: translateX(-50%) scale(1.04);
	}

	.donate-button-bottom:active {
		transform: translateX(-50%) scale(0.98);
	}

	.btn-text-white {
		transition: color 0.3s ease;
		color: hsl(var(--white66));
	}

	.donate-button-bottom:hover .btn-text-white {
		color: hsl(var(--foreground));
	}

	/* Blurple glass button hover effect */
	.btn-glass-blurple-hover {
		background: transparent;
		border-radius: 10px;
		transition:
			transform 0.2s ease,
			border-color 0.3s ease,
			box-shadow 0.3s ease,
			background 0.3s ease,
			color 0.3s ease;
	}

	.btn-glass-blurple-hover:hover {
		background: radial-gradient(
			circle at top left,
			rgb(92 95 255 / 0.12) 0%,
			rgb(69 66 255 / 0.12) 100%
		) !important;
		border-color: rgb(92 95 255 / 0.35);
		box-shadow:
			0 0 40px rgb(92 95 255 / 0.15),
			0 0 80px rgb(92 95 255 / 0.08);
		color: hsl(var(--foreground));
	}

	@media (max-width: 639px) {
		.donate-button-bottom {
			width: 100% !important;
			left: 0;
			transform: none;
			border-radius: 0 !important;
			border-top-left-radius: 0 !important;
			border-top-right-radius: 0 !important;
			border-left: none !important;
			border-right: none !important;
		}

		.donate-button-bottom:hover {
			transform: none;
		}

		.donate-button-bottom:active {
			transform: none;
		}
	}

	/* Subtle height reduction, let sides clip naturally */
	@media (max-width: 1200px) {
		.team-spread-scaler {
			height: 500px;
			--scale: 0.92;
		}
	}

	@media (max-width: 900px) {
		.team-spread-scaler {
			height: 460px;
			--scale: 0.85;
		}
	}

	@media (max-width: 700px) {
		.team-spread-scaler {
			height: 380px;
			--scale: 0.72;
		}
	}

	@media (max-width: 500px) {
		.team-spread-scaler {
			height: 340px;
			--scale: 0.65;
		}
	}

	@media (max-width: 400px) {
		.team-spread-scaler {
			height: 300px;
			--scale: 0.58;
		}
	}

	/* Donate modal: header + two panels in white8 */
	.donate-modal-content {
		padding: 16px;
	}

	@media (min-width: 768px) {
		.donate-modal-content {
			padding: 24px;
		}
	}

	.donate-modal-panels {
		display: flex;
		flex-direction: row;
		gap: 16px;
	}

	@media (max-width: 480px) {
		.donate-modal-panels {
			flex-direction: column;
		}
	}

	.donate-panel {
		flex: 1;
		min-width: 0;
		padding: 20px;
		border-radius: var(--radius-16);
		background-color: hsl(var(--white8));
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		text-align: center;
		text-decoration: none;
		color: hsl(var(--foreground));
	}

	.donate-panel-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
	}

	.donate-panel-icon-zap,
	.donate-panel-icon-send {
		width: 44px;
		height: 44px;
	}

	/* Gray66 gradient for donate icons – theme-aware */
	.donate-panel-icon :global(svg) {
		fill: url(#donate-gray66-light);
	}

	:global([data-theme='dark']) .donate-panel-icon :global(svg) {
		fill: url(#donate-gray66-dark);
	}

	.donate-modal-sr-only {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
		pointer-events: none;
	}

	.donate-panel-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.donate-panel-desc {
		font-size: 0.9375rem;
		color: hsl(var(--white66));
	}
</style>
