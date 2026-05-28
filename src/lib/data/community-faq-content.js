/**
 * User-facing FAQ for /community/faq.
 * Answers are HTML strings (trusted static content).
 */

/** @typedef {{ id: string, question: string, answer: string }} FaqItem */
/** @typedef {{ id: string, label: string, items: FaqItem[] }} FaqSection */

/** @type {FaqSection[]} */
export const COMMUNITY_FAQ_SECTIONS = [
	{
		id: 'basics',
		label: 'Basics',
		items: [
			{
				id: 'what-is-zapstore',
				question: 'What is Zapstore?',
				answer: `<p>Zapstore is an open Android app store. You can browse apps, install APKs, keep them updated, and support developers with Bitcoin tips when the app supports it.</p>
<p>Releases are tied to publisher identity and signatures where available, so you get more context than a random download link.</p>`
			},
			{
				id: 'install',
				question: 'How do I install Zapstore?',
				answer: `<p>Download the APK from <a href="https://zapstore.dev">zapstore.dev</a>. Android may ask you to allow installation from unknown sources once. That is normal for apps outside Google Play.</p>
<p>After install, open Zapstore and update it from the app when a new version is offered. Staying on a recent build avoids many catalog and update issues.</p>`
			},
			{
				id: 'need-play',
				question: 'Do I need Google Play to use Zapstore?',
				answer: `<p>No. Zapstore installs and runs without Google Play. You use it alongside or instead of Play for the apps you choose from the catalog.</p>`
			},
			{
				id: 'need-nostr',
				question: 'Do I need a Nostr account to use Zapstore?',
				answer: `<p>You can browse and install apps without signing in.</p>
<p>A Nostr account (for example via Amber) unlocks backup of your app list, zapping developers, seeing recommendations from people you follow, and fuller Web of Trust signals. For most regular use, signing in is worth it.</p>`
			}
		]
	},
	{
		id: 'trust',
		label: 'Trust & safety',
		items: [
			{
				id: 'is-safe',
				question: "Is Zapstore safe? How do I know apps aren't malicious?",
				answer: `<p>Every app on Zapstore is signed in the catalog, either by the developer with their Nostr identity or by the Zapstore indexer for apps sourced from GitHub. On first install, Zapstore shows who signed the listing and whether anyone in your Web of Trust follows that publisher.</p>
<p>Android also protects updates: it refuses an update signed with a different developer certificate than the app you already have, so you cannot be silently switched to a different signer on update.</p>
<p>Malware scanning and detailed privacy reports are on the roadmap. First installs still need your judgment, like any open store.</p>`
			},
			{
				id: 'wot',
				question: 'What is the Web of Trust (WoT) and why does it matter?',
				answer: `<p>The Web of Trust is based on who follows whom on Nostr. Before you install an app for the first time, Zapstore can show whether people you follow also follow or endorse that app’s developer.</p>
<p>It is not a guarantee of safety, but it is useful context compared with an anonymous APK. Zapstore does not hide apps that lack WoT signal; it warns when trust is thin. WoT on app detail pages is improving over time.</p>`
			},
			{
				id: 'impersonation',
				question: 'What if there are two apps with the same name?',
				answer: `<p>Compare publisher identity, source links, and trust signals before installing. Android blocks updates from a different signing key than your installed app.</p>
<p>Duplicate and impersonation handling in the catalog has improved; if you still see duplicates after an incident, try Profile → Clear local storage. If they persist, contact support.</p>`
			},
			{
				id: 'stolen-key',
				question: 'If the Zapstore signing key were stolen, would my apps be at risk?',
				answer: `<p>Risk is concentrated on <strong>first installs</strong>, not updates. Once an app is on your phone, Android will not apply an update signed with a different APK certificate.</p>
<p>The indexer key signs Nostr events that point at upstream URLs; APKs for indexed apps are still fetched from those original locations, which the UI should show. The team has been rotating and tightening indexer keys where needed.</p>`
			},
			{
				id: 'malware-scan',
				question: 'Does Zapstore scan apps for malware?',
				answer: `<p>Today the model is publisher identity, source transparency, signatures, and social trust, not automated malware scanning. Richer scanning and privacy reporting may come later. Treat first installs with the same caution you would anywhere else.</p>`
			}
		]
	},
	{
		id: 'comparisons',
		label: 'Comparing Zapstore',
		items: [
			{
				id: 'vs-play',
				question: 'How is Zapstore different from Google Play?',
				answer: `<p>Google Play can remove apps, enforce policy, and collect extensive user data. Developers pay to list and wait on review.</p>
<p>Zapstore has no single gatekeeper: publishing is permissionless, and no one can remotely uninstall apps from your device. The tradeoff is less centralized malware review; Zapstore leans on developer signing, source transparency, and community trust instead.</p>`
			},
			{
				id: 'vs-fdroid',
				question: 'How is Zapstore different from F-Droid?',
				answer: `<p>F-Droid often rebuilds apps from source on their infrastructure, which is its own trust model, and may lag behind upstream releases. F-Droid has built-in Tor support; Zapstore does not route the client through Tor yet (a relay is available over Tor; in-app Tor is planned).</p>
<p>Zapstore distributes APKs signed by developers (or points to upstream releases), with permissionless publishing and faster release cadence when developers push.</p>`
			},
			{
				id: 'vs-obtainium',
				question: 'How is Zapstore different from Obtainium?',
				answer: `<p>Obtainium is strong when you already have a GitHub (or similar) URL and want updates straight from that repo, including many pre-release tracks.</p>
<p>Zapstore adds discovery, search, stacks, publisher identity, and Web of Trust on top of indexed upstream APKs. Indexed apps are pulled from the same kinds of sources as Obtainium; Zapstore adds store UX and trust signals.</p>`
			},
			{
				id: 'replace-obtainium',
				question: 'Can I completely replace Obtainium with Zapstore?',
				answer: `<p>For stable final releases, many people use only Zapstore. For pre-releases, beta APKs, or niche repos not in the catalog, Obtainium is still a good companion. Keeping both is common until your apps and workflows are fully covered here.</p>`
			}
		]
	},
	{
		id: 'features',
		label: 'Features & usage',
		items: [
			{
				id: 'stacks',
				question: 'What are Stacks?',
				answer: `<p>Stacks are curated app lists, like playlists for apps. Create a stack, share a link, and others can browse or install everything in it.</p>
<p>Open a stack, use the menu (three dots) for Share or Copy link. Recent app versions also expose sharing from stack and app screens.</p>`
			},
			{
				id: 'backup',
				question: 'Can I back up my apps so I can restore them on a new phone?',
				answer: `<p>With a Nostr identity, Zapstore can store your installed app list as a private encrypted Nostr event. Sign in with the same key on a new device (for example via Amber) to restore the list.</p>
<p>Automatic sync that stays up to date with installs is in development. App data and settings inside each app are not backed up by Zapstore.</p>`
			},
			{
				id: 'older-versions',
				question: 'Can I install older versions of an app?',
				answer: `<p>Not as a main feature yet. Pinning an older release (for compatibility with self-hosted servers, for example) is a frequent request and is in development. Track updates on GitHub or ask in support.</p>`
			},
			{
				id: 'zaps',
				question: 'Can I zap (tip) developers directly from Zapstore?',
				answer: `<p>Yes, when the developer’s profile supports it. Connect a Lightning wallet via NWC (Alby Hub, Zeus, Minibits, and others), then zap from the app page.</p>
<p>Failed zaps are usually wallet or NWC configuration issues. Try refreshing your connection string in the wallet app.</p>`
			},
			{
				id: 'tor',
				question: 'Does Zapstore support Tor?',
				answer: `<p>There is a Tor-accessible Zapstore relay. The Android client does not route all traffic through Tor yet; you can use Orbot separately today. In-client Tor support will be announced when it ships.</p>`
			},
			{
				id: 'ios',
				question: 'Is iOS supported?',
				answer: `<p>Not yet. iOS support is planned but is more complex because of Apple’s platform rules. Check project announcements for timeline updates.</p>`
			},
			{
				id: 'missing-app',
				question: "I don't see an app I want. Can I request it?",
				answer: `<p>Paste the app’s <strong>GitHub repository URL</strong> into the Zapstore search bar and press Enter. If the repo has releases with a valid APK attached, it may be indexed in the background within a few minutes.</p>
<p>If nothing appears, confirm releases include an APK, update Zapstore, and try again later. Developers should use the publishing CLI for a proper listing with full trust signals.</p>`
			}
		]
	},
	{
		id: 'troubleshoot',
		label: 'Troubleshooting',
		items: [
			{
				id: 'no-longer-available',
				question: 'An app says "no longer available." What do I do?',
				answer: `<p>This usually means you are on an <strong>old Zapstore build</strong> that cannot read the current catalog.</p>
<p>If Zapstore still opens: open the <strong>Updates</strong> tab and look for Zapstore there, or check the top of <strong>Discover</strong> (latest releases), open the Zapstore entry, and tap <strong>Update</strong>. On some older versions you may need to search for Zapstore and open its app page before an update appears.</p>
<p>If other apps still show the same error or you cannot update in-app, install the latest APK from <a href="https://zapstore.dev">zapstore.dev</a>. That is the most reliable fix.</p>`
			},
			{
				id: 'cert-mismatch',
				question: 'I get a certificate mismatch or "APK signing certificate does not match" error.',
				answer: `<p>Update Zapstore to the latest version first. Older builds had certificate extraction bugs on some Android 10 devices (fixed around 1.0.6).</p>
<p>If it persists, the developer may have changed signing keys, or you may have installed from another source first. Treat the warning seriously unless you know why the key changed.</p>`
			},
			{
				id: 'no-updates',
				question: "I can't update my apps. Updates aren't showing up.",
				answer: `<p>Try in order: Profile → <strong>Clear local storage</strong>; update Zapstore itself from the website if needed; restart the app; scroll through your installed feed (some versions load updates as you scroll).</p>
<p>If it still fails, note your Zapstore version, Android version, and device when you report the issue.</p>`
			},
			{
				id: 'auto-update',
				question: "Zapstore updated an app I didn't ask it to update.",
				answer: `<p>Zapstore does not silently auto-update apps. You may have tapped Update All, or Zapstore may offer updates for apps that were installed outside Zapstore. Excluding apps not installed via Zapstore is being improved; check GitHub issue #315 for status.</p>`
			},
			{
				id: 'display-glitches',
				question: 'I have display glitches: duplicate apps, stale counts, wrong data.',
				answer: `<p>Go to <strong>Profile → Clear local storage</strong>. That resets Zapstore’s cache without uninstalling your apps. It fixes many duplicate entries and stale update badges.</p>`
			}
		]
	},
	{
		id: 'about',
		label: 'About Zapstore',
		items: [
			{
				id: 'sustainable',
				question: 'How is Zapstore financially sustainable?',
				answer: `<p>Development has been supported by grants, including <a href="https://opensats.org/" target="_blank" rel="noopener noreferrer">OpenSats</a> and the <a href="https://hrf.org/" target="_blank" rel="noopener noreferrer">Human Rights Foundation</a>. The team is exploring sustainable models that do not compromise open, permissionless publishing. Nothing is finalized yet.</p>`
			},
			{
				id: 'support-zapstore',
				question: 'Can I support Zapstore financially?',
				answer: `<p>You can zap us directly from the <a href="/apps/dev.zapstore.app">Zapstore app page</a>. Grant funding also supports ongoing work. Community input shapes future monetization ideas.</p>`
			},
			{
				id: 'get-help',
				question: 'How do I report a problem or get more help?',
				answer: `<p>Join <a href="/community/support">user or developer support on Signal</a>, post on the <a href="/community/forum">forum</a> when available, or open an issue on <a href="https://github.com/zapstore/zapstore/issues" target="_blank" rel="noopener noreferrer">GitHub</a>. Include Zapstore version, Android version, device model, and what you already tried (such as clearing local storage).</p>
<p>Publishing an app? See the <a href="/docs/faq">Developer FAQ</a>.</p>`
			}
		]
	}
];
