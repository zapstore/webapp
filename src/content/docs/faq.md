---
title: FAQ
weight: 99
---

## General

### What is Zapstore?

Zapstore is an open Android app store built on Nostr. Apps are discovered through your social graph, releases are cryptographically verified, and developers can receive Bitcoin payments directly from users.

### How is Zapstore different from Google Play?

Zapstore has no central gatekeeper. Trust comes from cryptographic signatures, social context, and reputation instead of a single platform operator.
Developers receive payments directly. No ads, no forced tracking, and no platform cut.

### Is Zapstore open source?

Yes. The app and publishing tooling are open source. You can review the code on [GitHub](https://github.com/zapstore/zapstore).

---

## For Users

### How do I install Zapstore?

Download the APK from [zapstore.dev](/) and install it on Android (10+, arm64). You may need to allow installs from unknown sources.

### How does social discovery work?

Zapstore uses your Nostr social graph. While browsing, you can see usage and recommendations from people you follow, which helps surface useful apps without paid ranking systems.

### Are apps on Zapstore safe?

Apps are signed by developers, and signatures are verified before install, so you can confirm who published a release.
Zapstore is still permissionless, so use normal software safety habits: check developer reputation, read community feedback, and prefer developers you trust.

### How do I suggest an app for the store?

Search for the full repository URL (e.g. `https://github.com/user/repo`). If the app is in the store it will be returned, otherwise search miss is recorded and the repository is queued for background indexing. The repository **must have releases with APK files**, make sure you check `/releases` or similar before requesting it. If it has valid APK releases, it should appear shortly. Otherwise it will be ignored.

### How do I support developers?

You can send Bitcoin directly via Lightning zaps through your Nostr identity. No separate account or payment processor is required.

---

## For Developers

### How do I publish an app?

See the [publishing guide](/docs/publish) — the interactive wizard handles source, metadata, signing, and publishing.

### Do I need to pay or register?

No. Publishing is free and requires no registration. You need a Nostr keypair to sign your releases. See [getting whitelisted](/docs/publish#getting-whitelisted) for how the relay verifies new developers.

### What if the relay rejects my event?

See [What happens if your event is rejected](/docs/trust-model#what-happens-if-your-event-is-rejected) in the Trust model.

### How do I receive payments?

Add a Lightning address to your Nostr profile. Users can zap you in the app, and you receive 100% of each payment.

---

## Technical

### What is Nostr?

Nostr is an open protocol for decentralized social networking. Zapstore uses it for identity, app metadata distribution via relays, and social features like follows and zaps.

Learn more at [nostr.com](https://nostr.com).

### How does verification work?

Developers sign releases with their Nostr key, and that signature is published with release metadata. On install, Zapstore verifies the signature against the developer pubkey.
This confirms provenance and helps detect tampering.

### What relays does Zapstore use?

Zapstore reads from and publishes to a default relay set, and you can configure additional relays.
Because relay infrastructure is decentralized, there is no single point of failure.
