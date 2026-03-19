<script>
	import { assets } from '$app/paths';
	import Nostr from '$lib/components/icons/Nostr.svelte';
	import { browser } from '$app/environment';

	async function handleClearLocalData() {
		if (!browser) return;
		const { clearLocalData } = await import('$lib/nostr/dexie.js');
		await clearLocalData();
		location.reload();
	}
</script>

<footer class="relative border-t border-border/50">
	<div
		class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent"
	></div>

	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
		<div class="footer-inner">
			<!-- Column 1: Brand (mobile: includes social/copyright/clear; desktop: logo + tagline only) -->
			<div class="footer-brand">
				<a href="/" class="footer-brand-link no-underline text-inherit">
					<img src={`${assets}/images/logo-dark.svg`} alt="Zapstore" class="footer-logo w-auto" />
					<span class="footer-brand-name font-semibold tracking-tight">Zapstore</span>
				</a>
				<p class="text-sm text-muted-foreground leading-relaxed footer-brand-desc">
					The open app store powered by your social network.
				</p>
				<!-- Desktop only: copyright in first column -->
				<div class="footer-desktop-copyright">
					<p class="text-sm text-muted-foreground pt-4">
						© {new Date().getFullYear()} Zapstore
					</p>
				</div>
				<!-- Mobile only: social + copyright + clear (hidden on desktop, shown in column 4 there) -->
				<div class="footer-mobile-extras">
					<div
						class="flex items-center justify-center md:justify-start gap-4 mt-4"
						aria-label="Contact links"
					>
						<a
							href="https://npub.world/npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8"
							class="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center justify-center h-5 w-5"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Nostr"
						>
							<Nostr variant="fill" size={18} color="hsl(var(--white66))" class="block" />
						</a>
						<a
							href="https://github.com/zapstore/zapstore"
							class="text-muted-foreground hover:text-foreground transition-colors"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="GitHub"
						>
							<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
								<path
									d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.63-1.41-3.63-1.41-.546-1.39-1.335-1.755-1.335-1.755-1.086-.745.085-.73.085-.73 1.2.085 1.83 1.235 1.83 1.235 1.07 1.83 2.805 1.305 3.495.99.105-.77.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.92 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"
								/>
							</svg>
						</a>
						<a
							href="https://x.com/zapstore_"
							class="text-muted-foreground hover:text-foreground transition-colors"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Twitter"
						>
							<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
								<path
									d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
								/>
							</svg>
						</a>
					</div>
					<p class="text-sm text-muted-foreground pt-4 text-center md:text-left">
						© {new Date().getFullYear()} Zapstore
					</p>
					<button
						onclick={handleClearLocalData}
						class="mt-3 text-xs cursor-pointer transition-colors hover:text-destructive"
						style="color: hsl(var(--white33));"
					>
						Clear local data
					</button>
				</div>
			</div>

			<!-- Full-width horizontal divider: mobile only -->
			<div class="footer-divider-h"></div>

			<!-- Columns 2–3: Developers + Community -->
			<div class="footer-links-row">
				<!-- Developers -->
				<div class="footer-link-col footer-link-col-mid">
					<h3 class="font-semibold text-base text-foreground mb-4">Developers</h3>
					<ul class="space-y-3">
						<li>
							<a
								href="/docs/publish"
								class="text-sm text-muted-foreground hover:text-foreground transition-colors"
								>Docs</a
							>
						</li>
						<li>
							<a
								href="/terms"
								class="text-sm text-muted-foreground hover:text-foreground transition-colors"
								>Terms of Service</a
							>
						</li>
					</ul>
				</div>

				<!-- Community -->
				<div class="footer-link-col">
					<h3 class="font-semibold text-base text-foreground mb-4">Community</h3>
					<ul class="space-y-3">
						<li>
							<a
								href="/community/forum"
								class="text-sm text-muted-foreground hover:text-foreground transition-colors"
								>Forum</a
							>
						</li>
						<li>
							<a
								href="/blog"
								class="text-sm text-muted-foreground hover:text-foreground transition-colors"
								>Blog</a
							>
						</li>
					</ul>
				</div>
			</div>

			<!-- Column 4 (desktop only): Find Us + social icons + copyright + clear local data -->
			<div class="footer-fourth">
				<h3 class="footer-fourth-title font-semibold text-base text-foreground">Find Us</h3>
				<div
					class="flex items-center gap-4"
					aria-label="Contact links"
				>
					<a
						href="https://npub.world/npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8"
						class="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center justify-center h-5 w-5"
						target="_blank"
						rel="noopener noreferrer"
						aria-label="Nostr"
					>
						<Nostr variant="fill" size={18} color="hsl(var(--white66))" class="block" />
					</a>
					<a
						href="https://github.com/zapstore/zapstore"
						class="text-muted-foreground hover:text-foreground transition-colors"
						target="_blank"
						rel="noopener noreferrer"
						aria-label="GitHub"
					>
						<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
							<path
								d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.63-1.41-3.63-1.41-.546-1.39-1.335-1.755-1.335-1.755-1.086-.745.085-.73.085-.73 1.2.085 1.83 1.235 1.83 1.235 1.07 1.83 2.805 1.305 3.495.99.105-.77.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.92 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"
							/>
						</svg>
					</a>
					<a
						href="https://x.com/zapstore_"
						class="text-muted-foreground hover:text-foreground transition-colors"
						target="_blank"
						rel="noopener noreferrer"
						aria-label="Twitter"
					>
						<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
							<path
								d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
							/>
						</svg>
					</a>
				</div>
				<button
					onclick={handleClearLocalData}
					class="mt-3 text-xs cursor-pointer transition-colors hover:text-destructive"
					style="color: hsl(var(--white33));"
				>
					Clear local data
				</button>
			</div>
		</div>
	</div>
</footer>

<style>
	/* ── Layout ───────────────────────────────────────────────── */
	.footer-inner {
		display: flex;
		flex-direction: column;
	}
	@media (min-width: 768px) {
		.footer-inner {
			display: grid;
			grid-template-columns: repeat(4, 1fr);
			gap: 2rem;
			align-items: start;
		}
		.footer-brand,
		.footer-link-col,
		.footer-fourth {
			text-align: left;
		}
		.footer-mobile-extras {
			display: none;
		}
		.footer-fourth {
			display: block;
		}
	}
	@media (min-width: 1024px) {
		.footer-inner {
			gap: 3rem;
		}
	}

	/* Mobile: fourth column hidden (social/copyright/clear live in brand via .footer-mobile-extras) */
	@media (max-width: 767px) {
		.footer-fourth {
			display: none;
		}
	}

	/* Desktop only: "Find Us" title + extra padding under it; hidden on mobile */
	.footer-fourth-title {
		display: none;
		margin: 0 0 1rem;
	}
	@media (min-width: 768px) {
		.footer-fourth-title {
			display: block;
			margin-bottom: 1.5rem;
		}
	}

	/* Desktop only: copyright in first column */
	.footer-desktop-copyright {
		display: none;
	}
	@media (min-width: 768px) {
		.footer-desktop-copyright {
			display: block;
		}
	}

	/* ── Brand (mobile: centered; desktop: left-aligned) ────────── */
	.footer-brand {
		text-align: center;
	}
	.footer-brand-link {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	@media (min-width: 768px) {
		.footer-brand {
			text-align: left;
		}
		.footer-brand-link {
			justify-content: flex-start;
		}
	}
	.footer-logo {
		height: 2.25rem;
	}
	.footer-brand-name {
		font-size: 1.5rem;
	}
	@media (min-width: 768px) {
		.footer-logo {
			height: 1.5rem;
		}
		.footer-brand-name {
			font-size: 1.125rem;
		}
	}

	/* ── Horizontal divider: mobile only, full-bleed ─────────── */
	.footer-divider-h {
		height: 1px;
		background-color: hsl(var(--border) / 0.5);
		margin: 1.75rem calc(-1 * 1rem);
	}
	@media (min-width: 640px) {
		.footer-divider-h {
			margin-left: calc(-1 * 1.5rem);
			margin-right: calc(-1 * 1.5rem);
		}
	}
	@media (min-width: 768px) {
		.footer-divider-h {
			display: none;
		}
	}

	/* ── Link columns: flex row on mobile ────────────────────── */
	.footer-links-row {
		display: flex;
		align-items: stretch;
	}
	.footer-link-col {
		flex: 1;
		text-align: center;
	}
	@media (min-width: 768px) {
		.footer-link-col {
			text-align: left;
		}
	}
	/* Vertical dividers on the middle column */
	.footer-link-col-mid {
		border-left: 1px solid hsl(var(--border) / 0.5);
		border-right: 1px solid hsl(var(--border) / 0.5);
		padding: 0 0.75rem;
	}

	/* ── Desktop: dissolve wrapper; column centering/padding in footer-inner rule above ─────── */
	@media (min-width: 768px) {
		.footer-links-row {
			display: contents;
		}
		.footer-link-col-mid {
			border-left: none;
			border-right: none;
		}
	}
</style>
