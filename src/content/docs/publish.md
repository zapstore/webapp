---
title: Publishing apps
weight: 2
---

Use `zsp` to publish apps to Zapstore. It handles APK fetching, metadata enrichment, signing, and relay publishing.

For most developers, the fastest path is the interactive wizard:

```bash
zsp publish --wizard
```

The wizard guides you through source selection, metadata, signing, and publish. It creates a `zapstore.yaml` config in your repo root that you should commit.

## Install

```bash
go install github.com/zapstore/zsp@latest
```

Or download a binary from the [zsp releases page](https://github.com/zapstore/zsp/releases).

## Non-wizard quick path

If you already know your source, you can publish directly:

```bash
zsp publish -r github.com/your-org/your-app
```

For all flags and advanced usage, see the [`zsp` README](https://github.com/zapstore/zsp).

## APK sources

`zsp` fetches APKs from multiple sources. The source type is auto-detected from the URL.

**GitHub, GitLab, Codeberg, Gitea/Forgejo** — fetches from release assets:

```yaml
repository: https://github.com/your-org/your-app
```

**F-Droid / IzzyOnDroid** — useful when you want F-Droid APKs but richer metadata from GitHub or Play Store:

```yaml
repository: https://github.com/AntennaPod/AntennaPod
release_source: https://f-droid.org/packages/de.danoeh.antennapod
```

**Local file** — publish a build artifact directly:

```yaml
release_source: ./build/outputs/apk/release/app-release.apk
repository: https://github.com/your-org/your-app
```

**Direct URL** — any URL that points to an APK:

```yaml
release_source: https://example.com/downloads/app.apk
```

## Metadata enrichment

`zsp` can pull app metadata from external sources automatically. Fields in `zapstore.yaml` always take priority.

| Source | Data retrieved |
|--------|----------------|
| `github` | Name, description, topics, license, website |
| `gitlab` | Name, description, topics, license |
| `fdroid` | Name, description, categories, icon, screenshots |
| `playstore` | Name, description, icon, screenshots |

```yaml
metadata_sources:
  - playstore
  - github
```

Metadata is fetched automatically for new releases. Use `--skip-metadata` to disable.

## Getting whitelisted

When you first publish, the relay verifies you are a real developer before accepting your events. If your event is rejected — which is common for new npubs — you don't need to ask anyone for access. The wizard handles this for you.

**Step 1: Run the wizard.** It writes a `zapstore.yaml` to your repo root with your repository URL and pubkey already filled in:

```yaml
repository: https://github.com/your-org/your-app
pubkey: npub1your...
```

**Step 2: Commit `zapstore.yaml` to your repo.**

**Step 3: Publish.** When your app event reaches the relay, it fetches `zapstore.yaml` from your repository, verifies the pubkey matches, and whitelists you. All future publishes pass immediately.

Auto-whitelisting via `zapstore.yaml` works for repositories hosted on GitHub, GitLab, Codeberg, and self-hosted Gitea/Forgejo instances.

If your Nostr identity already has social reputation (followers, activity), you may be whitelisted via the Vertex reputation system without needing repo verification.

See [Trust model](/docs/trust-model) for the full picture.

## Certificate linking

During your first publish, `zsp` will ask you to link your APK signing certificate to your Nostr identity. This is a one-time step that creates a cryptographic proof (NIP-C1) connecting your APK signing key to your Nostr identity — you need your signing keystore (`.jks`, `.p12`, or `.pem`) to complete it.

See [Trust model](/docs/trust-model#verification-on-install) for why this matters.

## Signing methods

Set the `SIGN_WITH` environment variable before running `zsp publish`.

| Method | Value |
|--------|-------|
| Nostr private key | `SIGN_WITH=nsec1...` |
| Hex private key | `SIGN_WITH=0123456789abcdef...` |
| NIP-46 bunker | `SIGN_WITH=bunker://pubkey?relay=...&secret=...` |
| Browser extension (NIP-07) | `SIGN_WITH=browser` |

For CI/CD, use a bunker URL stored as a secret. Avoid putting `nsec` directly in environment variables on shared systems — it can be exposed via `/proc/*/environ` or shell history.

## Next steps

- [Trust model](/docs/trust-model) — whitelisting, Vertex reputation, blocking policy
