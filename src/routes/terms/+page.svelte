<script lang="js">
import SeoHead from '$lib/components/layout/SeoHead.svelte';
import { SITE_URL } from '$lib/config';
</script>

<SeoHead
	title="Terms of Service — Zapstore"
	description="Terms of Service for Zapstore infrastructure services."
	url="{SITE_URL}/terms"
/>

<section class="terms-page">
	<div class="container mx-auto py-12 px-4 sm:px-6 lg:px-8">
		<article class="terms-body">
			<header class="terms-header">
				<h1 class="terms-title">Terms of Service</h1>
				<p class="terms-effective">Effective: March 2026</p>
			</header>

			<div class="prose">
				<p>
					These Terms of Service govern your use of the Zapstore infrastructure services operated by
					the Zapstore team, specifically:
				</p>
				<ul>
					<li><strong>relay.zapstore.dev</strong> — the default Nostr relay for app catalog events</li>
					<li><strong>cdn.zapstore.dev</strong> — the Blossom CDN for app assets (APKs, icons, screenshots)</li>
				</ul>
				<p>
					By publishing events to <code>relay.zapstore.dev</code> or uploading blobs to
					<code>cdn.zapstore.dev</code>, you agree to these terms.
				</p>
				<p>
					The Zapstore mobile app, the <code>zsp</code> CLI, and this website are open-source software
					you run yourself. These terms do not apply to software you self-host.
				</p>

				<h2>Permitted use</h2>
				<p>
					These services are intended for publishing legitimate Android applications and their
					associated metadata. You may use them to distribute open-source or proprietary apps,
					provided the content complies with these terms.
				</p>

				<h2>Android app identifiers</h2>
				<p>
					Android application IDs (package names) are treated as unique in the Zapstore catalog:
					<strong>first come, first served</strong> for a given identifier. We nevertheless reserve
					the right to intervene in disputes or conflicts (for example impersonation, squatting, or
					trademark issues), including by removing or restricting catalog entries, at our sole
					discretion.
				</p>

				<h2>Prohibited content</h2>
				<p>The following are prohibited and will result in removal and a permanent block:</p>
				<ul>
					<li><strong>Malware</strong> — apps that damage devices, exfiltrate user data without consent, or perform actions the user has not authorized</li>
					<li><strong>Spyware or stalkerware</strong> — apps designed to covertly surveil users</li>
					<li><strong>Pornographic content</strong></li>
					<li><strong>Content that sexualizes minors</strong> — zero tolerance; will be reported to relevant authorities</li>
					<li><strong>Violent or threatening content</strong> — apps that facilitate real-world violence or harassment</li>
					<li><strong>Impersonation</strong> — publishing under another developer's identity or misrepresenting your app as a different app</li>
					<li><strong>Illegal content</strong> — anything prohibited by applicable law</li>
				</ul>

				<h2>Enforcement</h2>
				<p>
					We reserve the right to remove any content and block any pubkey from our relay and CDN at
					our sole discretion, at any time, without prior notice.
				</p>
				<p>
					Because Zapstore is built on Nostr, a block on our relay does not prevent you from
					publishing to other relays or running your own infrastructure. Users can configure
					Zapstore to read from any relay.
				</p>

				<h2>No warranty</h2>
				<p>
					These services are provided as-is, without warranty of any kind. We do not guarantee
					uptime, availability, or data retention. We may modify or discontinue the services at any
					time.
				</p>

				<h2>Contact</h2>
				<p>
					To report a violation or appeal a block, contact the Zapstore team on
					<a href="https://npub.world/npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8" target="_blank" rel="noopener noreferrer">Nostr</a>
					or via the community channels linked in the footer.
				</p>
			</div>
		</article>
	</div>
</section>

<style>
	.terms-page {
		min-height: 100vh;
	}

	.terms-body {
		max-width: 680px;
	}

	.terms-header {
		margin-bottom: 2.5rem;
	}

	.terms-title {
		font-size: 2rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0 0 0.5rem;
		line-height: 1.2;
		letter-spacing: -0.02em;
	}

	.terms-effective {
		font-size: 0.875rem;
		color: hsl(var(--white33));
		margin: 0;
	}

	.prose {
		color: hsl(var(--white66));
		line-height: 1.75;
		font-size: 1rem;
	}

	.prose :global(h2) {
		color: hsl(var(--foreground));
		font-size: 1.25rem;
		font-weight: 650;
		margin-top: 2em;
		margin-bottom: 0.75em;
	}

	.prose :global(p) {
		margin: 0 0 1.25em;
	}

	.prose :global(ul) {
		padding-left: 1.5rem;
		margin: 0 0 1.25em;
	}

	.prose :global(li) {
		margin-bottom: 0.5em;
	}

	.prose :global(a) {
		color: hsl(var(--blurple-bright-0));
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.prose :global(a:hover) {
		opacity: 0.85;
	}

	.prose :global(code) {
		font-size: 0.875em;
		background: hsl(var(--white8));
		padding: 2px 6px;
		border-radius: 5px;
		color: hsl(var(--foreground));
	}

	.prose :global(strong) {
		color: hsl(var(--foreground));
		font-weight: 600;
	}
</style>
