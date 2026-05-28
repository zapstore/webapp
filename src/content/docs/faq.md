---
title: Developer FAQ
description: Developer FAQ for publishing apps on Zapstore with zsp, APK signing, Nostr verification, relay publishing, and troubleshooting.
weight: 99
---

Looking for install, safety, and everyday use? See the [Community FAQ](/community/faq).

## Basics

### What is Zapstore?

Zapstore is an open Android app store built on Nostr. Developers publish signed release metadata to relays; users discover apps, verify publishers, and install APKs from the original sources.

New to the project? Start with the [quickstart](/docs/quickstart).

### Who is Zapstore for?

Anyone shipping Android APKs outside Google Play: indie developers, FOSS projects, and teams that want permissionless distribution with cryptographic identity and community curation.

### Is Zapstore only for Nostr apps?

No. Many listed apps have nothing to do with Nostr. Nostr is the identity and metadata layer; the catalog is for Android apps broadly.

---

## Publishing

### How do I publish an app?

Use [`zsp`](https://github.com/zapstore/zsp), the Zapstore publishing CLI. The full flow is in the [publishing guide](/docs/publish).

Typical steps:

1. Install `zsp` (see the publish doc).
2. Add `zapstore.yaml` at your repo root.
3. Configure signing in `.env` (`SIGN_WITH` as nsec, bunker URL, NIP-07, etc.).
4. Run `zsp publish` or `zsp publish --wizard`.

Indexed apps from GitHub can also appear when users search for your repo URL, but self-publishing with your own key is the path for full publisher identity and trust signals.

### Does publishing cost money?

No listing fees, no revenue share, no registration fee. Users can zap you over Lightning when your profile supports it; Zapstore does not take a cut today.

### How often can I push updates?

As often as you like. There is no review queue or approval wait. Push a new release when you are ready; users see it after relays index the event.

### Why publish on Zapstore instead of only hosting the APK?

You keep direct distribution, and you gain discovery (search, stacks, community), update notifications for Zapstore users, a link between your Nostr identity and your APK signing key, and optional Lightning tips from the app page.

### Can I publish an app that is already on GitHub, Play, or F-Droid?

Yes. Many apps are indexed from GitHub releases or self-published with `zsp`. Play and F-Droid are separate channels; Zapstore is another distribution path, not a replacement you must choose exclusively.

### What is the difference between self-published and indexed apps?

**Self-published** means you (or your project) signed and published the catalog event with your Nostr key.

**Indexed** means Zapstore’s indexer signed an event pointing at an APK on an upstream source (often GitHub). The APK is still downloaded from that original URL, which the app page should show.

Both are valid. Self-publishing gives the strongest publisher identity; indexing helps apps appear before the developer has run `zsp`.

---

## Signing and trust

### How does verification work?

Developers sign release metadata with a Nostr key. Zapstore checks those signatures and, where available, compares APK signing certificates to declarations on the catalog (including linked identity events).

On install, the client uses publisher data and OS-level certificate rules. See the [trust model](/docs/trust-model) for relay rules, rejection cases, and certificate linking (NIP-C1).

### What does my Nostr key sign?

Your key signs Nostr catalog events (app metadata, releases, stacks, etc.). It does not replace the APK’s Android signing certificate. Both matter: Nostr for who published the listing, Android for what can update on the device.

### What happens if my app signing key changes?

Android will refuse updates signed with a different key than the installed app. If you rotate keys, users may need to uninstall and reinstall, and you should update certificate linking in `zsp` so metadata matches the new APK.

### How does Zapstore handle impersonation or duplicate listings?

Open catalogs can have name collisions. Zapstore surfaces publisher identity, source URLs, and social trust signals. Users should compare pubkey, source, and whether the real developer self-published.

If you published from the wrong key, you can delete the bad event with [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md) and republish from the correct npub.

### What relays does Zapstore use?

Apps are published to Zapstore’s relay set (configurable in tooling). Clients read from those relays plus any you add. Details and rejection behavior are in the [trust model](/docs/trust-model).

---

## Publishing issues

### My npub was rejected when publishing. What do I do?

New npubs are sometimes flagged automatically. Add a `pubkey` field with your npub to `zapstore.yaml` at the repository root (committed to the repo). You should not need manual whitelisting for that case.

See [getting whitelisted](/docs/publish#getting-whitelisted) for how the relay verifies developers.

### What if the relay rejects my event?

Check signature, kind, required tags, APK URL, and whitelist rules. The [trust model](/docs/trust-model#what-happens-if-your-event-is-rejected) walks through common rejection reasons.

### I published from the wrong npub. Can I delete it?

Yes. Send a NIP-09 deletion event for the incorrect release from that pubkey, then publish again from the correct key.

### My app does not appear in search. What should I check?

Confirm the event reached relays, the app is not deleted, and metadata (name, package id) is correct. For GitHub indexing, ensure releases include a valid APK asset. Allow a few minutes after publish.

### My APK was not detected. What should I check?

Release must attach an `.apk` (or pattern your `zapstore.yaml` assets cover). Private repos need tokens configured in `zsp`. Wrong repo URL or empty releases are the usual causes.

### My metadata looks wrong. How do I fix it?

Republish with corrected `zapstore.yaml` and release tags. If you linked the wrong signing certificate, use `zsp identity` flows described in `zsp` release notes and the trust model doc.

---

## Growth and payments

### How do users find my app?

Search, stacks, social graph signals, deep links to your app page, and badges on your site pointing to Zapstore.

### Can I add a “Get it on Zapstore” badge?

Yes. Use assets and guidelines on the [assets page](/assets).

### How do zaps work for developers?

Add a Lightning address to your Nostr profile. Users with a wallet connected via NWC can zap from the app page. Payments go to you directly.

### Can I see download or impression stats?

Check current studio and docs for analytics features as they ship; this FAQ does not list every metric. Ask on developer support channels if you need something specific.

---

## Technical

### What is Nostr’s role?

Identity, signed catalog events, relays, follows, and zaps. [nostr.com](https://nostr.com) explains the protocol.

### How do I receive payments?

Lightning address on your profile; users zap in the client. No Zapstore payment processor in the middle.

---

## Developer support

### Where do I get help?

[Developer support on Signal](/community/support) (developer group), [GitHub issues](https://github.com/zapstore/zapstore/issues), and Nostr. For end-user install and safety questions, point people to the [Community FAQ](/community/faq).
