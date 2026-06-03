/**
 * Developer FAQ for /docs/faq.
 * Answers are HTML strings (trusted static content).
 */

/** @typedef {{ id: string, question: string, answer: string }} FaqItem */
/** @typedef {{ id: string, label: string, items: FaqItem[] }} FaqSection */

/** @type {FaqSection[]} */
export const DEVELOPER_FAQ_SECTIONS = [
	{
		id: 'basics',
		label: 'Basics',
		items: [
			{
				id: 'what-is-zapstore',
				question: 'What is Zapstore?',
				answer: `<p>Zapstore is an open Android app store built on Nostr. Developers publish signed release metadata to relays; users discover apps, verify publishers, and install APKs from the original sources.</p>
<p>New to the project? Start with the <a href="/docs/quickstart">quickstart</a>.</p>`
			},
			{
				id: 'who-is-zapstore-for',
				question: 'Who is Zapstore for?',
				answer: `<p>Anyone shipping Android APKs outside Google Play: indie developers, FOSS projects, and teams that want permissionless distribution with cryptographic identity and community curation.</p>`
			},
			{
				id: 'nostr-only',
				question: 'Is Zapstore only for Nostr apps?',
				answer: `<p>No. Many listed apps have nothing to do with Nostr. Nostr is the identity and metadata layer; the catalog is for Android apps broadly.</p>`
			}
		]
	},
	{
		id: 'publishing',
		label: 'Publishing',
		items: [
			{
				id: 'how-to-publish',
				question: 'How do I publish an app?',
				answer: `<p>Use <code>zsp</code>, the Zapstore publishing CLI. The full flow is in the <a href="/docs/publish">publishing guide</a>.</p>
<p>Typical steps:</p>
<ol>
<li>Install <code>zsp</code> (see the publish doc).</li>
<li>Add <code>zapstore.yaml</code> at your repo root.</li>
<li>Configure signing in <code>.env</code> (<code>SIGN_WITH</code> as nsec, bunker URL, NIP-07, etc.).</li>
<li>Run <code>zsp publish</code> or <code>zsp publish --wizard</code>.</li>
</ol>
<p>Indexed apps from GitHub can also appear when users search for your repo URL, but self-publishing with your own key is the path for full publisher identity and trust signals.</p>`
			},
			{
				id: 'publishing-cost',
				question: 'Does publishing cost money?',
				answer: `<p>No listing fees, no revenue share, no registration fee. Users can tip you over Lightning when your profile supports it; Zapstore does not take a cut today.</p>`
			},
			{
				id: 'update-frequency',
				question: 'How often can I push updates?',
				answer: `<p>As often as you like. There is no review queue or approval wait. Push a new release when you are ready; users see it after relays index the event.</p>`
			},
			{
				id: 'why-publish',
				question: 'Why publish on Zapstore instead of only hosting the APK?',
				answer: `<p>You keep direct distribution, and you gain discovery (search, stacks, community), update notifications for Zapstore users, a link between your Nostr identity and your APK signing key, and optional Lightning tips from the app page.</p>`
			},
			{
				id: 'already-on-other-stores',
				question: 'Can I publish an app that is already on GitHub, Play, or F-Droid?',
				answer: `<p>Yes. Many apps are indexed from GitHub releases or self-published with <code>zsp</code>. Play and F-Droid are separate channels; Zapstore is another distribution path, not a replacement you must choose exclusively.</p>`
			},
			{
				id: 'self-published-vs-indexed',
				question: 'What is the difference between self-published and indexed apps?',
				answer: `<p><strong>Self-published</strong> means you (or your project) signed and published the catalog event with your Nostr key.</p>
<p><strong>Indexed</strong> means Zapstore’s indexer signed an event pointing at an APK on an upstream source (often GitHub). The APK is still downloaded from that original URL, which the app page should show.</p>
<p>Both are valid. Self-publishing gives the strongest publisher identity; indexing helps apps appear before the developer has run <code>zsp</code>.</p>`
			}
		]
	},
	{
		id: 'signing-trust',
		label: 'Signing and trust',
		items: [
			{
				id: 'how-verification-works',
				question: 'How does verification work?',
				answer: `<p>Developers sign release metadata with a Nostr key. Zapstore checks those signatures and, where available, compares APK signing certificates to declarations on the catalog (including linked identity events).</p>
<p>On install, the client uses publisher data and OS-level certificate rules. See the <a href="/docs/trust-model">trust model</a> for relay rules, rejection cases, and certificate linking (NIP-C1).</p>`
			},
			{
				id: 'what-key-signs',
				question: 'What does my Nostr key sign?',
				answer: `<p>Your key signs Nostr catalog events (app metadata, releases, stacks, etc.). It does not replace the APK’s Android signing certificate. Both matter: Nostr for who published the listing, Android for what can update on the device.</p>`
			},
			{
				id: 'signing-key-change',
				question: 'What happens if my app signing key changes?',
				answer: `<p>Android will refuse updates signed with a different key than the installed app. If you rotate keys, users may need to uninstall and reinstall, and you should update certificate linking in <code>zsp</code> so metadata matches the new APK.</p>`
			},
			{
				id: 'impersonation',
				question: 'How does Zapstore handle impersonation or duplicate listings?',
				answer: `<p>Open catalogs can have name collisions. Zapstore surfaces publisher identity, source URLs, and social trust signals. Users should compare pubkey, source, and whether the real developer self-published.</p>
<p>If you published from the wrong key, you can delete the bad event with <a href="https://github.com/nostr-protocol/nips/blob/master/09.md" target="_blank" rel="noopener noreferrer">NIP-09</a> and republish from the correct npub.</p>`
			},
			{
				id: 'relays',
				question: 'What relays does Zapstore use?',
				answer: `<p>Apps are published to Zapstore’s relay set (configurable in tooling). Clients read from those relays plus any you add. Details and rejection behavior are in the <a href="/docs/trust-model">trust model</a>.</p>`
			}
		]
	},
	{
		id: 'publishing-issues',
		label: 'Publishing issues',
		items: [
			{
				id: 'npub-rejected',
				question: 'My npub was rejected when publishing. What do I do?',
				answer: `<p>New npubs are sometimes flagged automatically. Add a <code>pubkey</code> field with your npub to <code>zapstore.yaml</code> at the repository root (committed to the repo). You should not need manual whitelisting for that case.</p>
<p>See <a href="/docs/publish#getting-whitelisted">getting whitelisted</a> for how the relay verifies developers.</p>`
			},
			{
				id: 'relay-rejects-event',
				question: 'What if the relay rejects my event?',
				answer: `<p>Check signature, kind, required tags, APK URL, and whitelist rules. The <a href="/docs/trust-model#what-happens-if-your-event-is-rejected">trust model</a> walks through common rejection reasons.</p>`
			},
			{
				id: 'wrong-npub',
				question: 'I published from the wrong npub. Can I delete it?',
				answer: `<p>Yes. Send a NIP-09 deletion event for the incorrect release from that pubkey, then publish again from the correct key.</p>`
			},
			{
				id: 'not-in-search',
				question: 'My app does not appear in search. What should I check?',
				answer: `<p>Confirm the event reached relays, the app is not deleted, and metadata (name, package id) is correct. For GitHub indexing, ensure releases include a valid APK asset. Allow a few minutes after publish.</p>`
			},
			{
				id: 'apk-not-detected',
				question: 'My APK was not detected. What should I check?',
				answer: `<p>Release must attach an <code>.apk</code> (or pattern your <code>zapstore.yaml</code> assets cover). Private repos need tokens configured in <code>zsp</code>. Wrong repo URL or empty releases are the usual causes.</p>`
			},
			{
				id: 'wrong-metadata',
				question: 'My metadata looks wrong. How do I fix it?',
				answer: `<p>Republish with corrected <code>zapstore.yaml</code> and release tags. If you linked the wrong signing certificate, use <code>zsp identity</code> flows described in <code>zsp</code> release notes and the trust model doc.</p>`
			}
		]
	},
	{
		id: 'growth-payments',
		label: 'Growth and payments',
		items: [
			{
				id: 'discovery',
				question: 'How do users find my app?',
				answer: `<p>Search, stacks, social graph signals, deep links to your app page, and badges on your site pointing to Zapstore.</p>`
			},
			{
				id: 'badge',
				question: 'Can I add a “Get it on Zapstore” badge?',
				answer: `<p>Yes. Use assets and guidelines on the <a href="/assets">assets page</a>.</p>`
			},
			{
				id: 'tips-for-developers',
				question: 'How do tips work for developers?',
				answer: `<p>Add a Lightning address to your Nostr profile. Users with a wallet connected via NWC can send a tip from the app page. Payments go to you directly.</p>`
			},
			{
				id: 'stats',
				question: 'Can I see download or impression stats?',
				answer: `<p>Check current studio and docs for analytics features as they ship; this FAQ does not list every metric. Ask on developer support channels if you need something specific.</p>`
			}
		]
	},
	{
		id: 'technical',
		label: 'Technical',
		items: [
			{
				id: 'nostr-role',
				question: 'What is Nostr’s role?',
				answer: `<p>Identity, signed catalog events, relays, follows, and Lightning tips. <a href="https://nostr.com" target="_blank" rel="noopener noreferrer">nostr.com</a> explains the protocol.</p>`
			},
			{
				id: 'receive-payments',
				question: 'How do I receive payments?',
				answer: `<p>Lightning address on your profile; users tip in the client. No Zapstore payment processor in the middle.</p>`
			}
		]
	},
	{
		id: 'support',
		label: 'Developer support',
		items: [
			{
				id: 'where-get-help',
				question: 'Where do I get help?',
				answer: `<p><a href="/community/support">Developer support on Signal</a> (developer group), <a href="https://github.com/zapstore/zapstore/issues" target="_blank" rel="noopener noreferrer">GitHub issues</a>, and Nostr. For end-user install and safety questions, point people to the <a href="/community/faq">User FAQ</a>.</p>`
			}
		]
	}
];
