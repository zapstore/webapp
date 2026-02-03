---
title: FAQ
weight: 5
---

## General

### What is Zapstore?

Zapstore is an open app store for Android. Apps are discovered through your social network, cryptographically verified, and developers can receive bitcoin payments directly from users.

### How is Zapstore different from Google Play?

Zapstore has no central gatekeeper. Anyone can publish an app without approval. Apps are signed by developers and verified by users, rather than relying on a corporation to decide what's trustworthy.

There are no ads, no tracking, and no 30% platform fee. Developers keep 100% of what they earn.

### Is Zapstore open source?

Yes. The Android app, CLI, and all related tools are fully open source. You can review the code on [GitHub](https://github.com/zapstore/zapstore).

---

## For Users

### How do I install Zapstore?

Download the APK from [zapstore.dev](/) and install it on your Android device (10+, arm64). You may need to allow installation from unknown sources in your settings.

### How does social discovery work?

Zapstore connects to your Nostr social graph. When browsing apps, you can see which apps are used and recommended by people you follow. This helps surface quality apps without relying on algorithms or paid rankings.

### Are apps on Zapstore safe?

Every app on Zapstore is cryptographically signed by its developer. Signatures are verified before installation. This means you always know exactly who published an app.

That said, Zapstore is permissionless — anyone can publish. Use the same judgment you would with any software: check the developer's reputation, look at community feedback, and start with apps from developers you trust.

### How do I support developers?

You can send bitcoin directly to developers using Lightning Network zaps. This happens through your Nostr identity — no account or payment processor needed.

---

## For Developers

### How do I publish an app?

Use the Zapstore CLI to publish your APK. The CLI extracts metadata, signs the release with your Nostr key, and publishes to relays. See the [publishing guide](/docs/publish) for step-by-step instructions.

### Do I need to pay or register?

No. Publishing is free and requires no registration. You just need a Nostr keypair to sign your releases.

### How do I receive payments?

Add a Lightning address to your Nostr profile. Users can zap you directly through the Zapstore app. You receive 100% of every payment — no platform cut.

### What signing methods are supported?

The CLI supports:
- **nsec** — Your raw private key
- **NIP-07** — Browser extension signing
- **Bunker URLs** — Remote signing via Nostr Connect

---

## Technical

### What is Nostr?

Nostr is an open protocol for decentralized social networking. Zapstore uses Nostr for identity (developer and user keys), app metadata distribution (relays), and social features (follows, recommendations, zaps).

Learn more at [nostr.com](https://nostr.com).

### How does verification work?

Developers sign app releases with their Nostr private key. The signature is published alongside the APK metadata. When you install an app, Zapstore verifies that the signature matches the developer's public key.

This proves the app came from the claimed developer and hasn't been tampered with.

### What relays does Zapstore use?Zapstore publishes to and reads from a set of default relays, but you can configure your own. The decentralized relay network means there's no single point of failure.
