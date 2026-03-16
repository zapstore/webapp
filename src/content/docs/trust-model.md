---
title: Trust model
weight: 3
---

Zapstore uses a layered trust model. We keep the bar for getting listed low — trust is established cryptographically and through social reputation. In exchange, we enforce a strict content policy and will block pubkeys that publish malware or violate our [Terms of Service](/terms).

## How whitelisting works

When you publish for the first time, the relay checks whether your pubkey is allowed to write events. New pubkeys are not automatically trusted. The relay works through these checks in order:

**1. Explicit allow list** — if your pubkey is on the relay's allow list, you're in immediately. This covers the Zapstore team and a small set of early developers.

**2. Repository verification via `zapstore.yaml`** — if your repository contains a `zapstore.yaml` with your pubkey, the relay fetches it, verifies the match, and whitelists you. This is the standard path for new developers. See [Publishing apps](/docs/publish#getting-whitelisted) for setup instructions.

**3. Vertex reputation** — if repo verification fails or isn't applicable, the relay queries the [Vertex](https://vertexlab.io) reputation system. If your Nostr identity has sufficient social graph standing (followers, activity, PageRank), you're whitelisted automatically.

**4. Blocked** — if none of the above pass, the event is rejected. Contact the Zapstore team if you believe this is an error.

## What happens if your event is rejected

Check these in order:

1. **No `zapstore.yaml` in your repo** — add one with your `pubkey` field and commit it before publishing.
2. **Pubkey mismatch** — the `pubkey` in `zapstore.yaml` must exactly match the key you're signing with (`SIGN_WITH`).
3. **Repository host not supported** — GitHub, GitLab, Codeberg, and Gitea/Forgejo are supported. Other hosts fall back to Vertex reputation.
4. **Low Nostr reputation** — if repo verification fails, the relay falls back to Vertex. Building a Nostr social presence (followers, follows, activity) helps.
5. **Pubkey is blocked** — contact the Zapstore team if you believe this is an error.

## Blocking and removal

Getting listed is easy. Staying listed requires publishing legitimate software.

Pubkeys can be added to the relay's block list at any time. Reasons include:

- Publishing malware, spyware, or apps that exfiltrate user data without consent
- Impersonating another developer or app
- Violating the [Terms of Service](/terms) in any other way

A blocked pubkey cannot publish new events to the relay, and existing events may be removed. There is no automated appeals process — contact the Zapstore team if you believe a block was applied in error.

## Verification on install

When a user installs your app, Zapstore verifies:

- The release event is signed by the developer's Nostr key
- The APK hash in the release event matches the downloaded file
- If certificate linking is present, the APK signing certificate matches the linked proof

If any check fails, the install is blocked and the user is told why.

## Decentralized catalogs

The Zapstore relay (`relay.zapstore.dev`) is the default catalog, but it is not the only one. Because Zapstore is built on Nostr, anyone can run a relay and publish their own app catalog with different rules, different curation, and different trust policies.

Users can configure Zapstore to read from any relay. Developers can publish to any relay. The default catalog is one point of coordination, not a gatekeeper.

If you disagree with a moderation decision on the default relay, you can publish to an alternative catalog and users can find your app there.
