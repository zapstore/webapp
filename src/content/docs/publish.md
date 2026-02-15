---
title: Publishing apps
weight: 10
---

Use `zsp` to publish apps.

For most users, the fastest path is the interactive wizard:

```bash
zsp publish --wizard
```

The wizard guides you through source selection, metadata, signing, and publish, so you usually do not need to write config by hand.

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

<!-- ## Auto-whitelisting via GitHub

If your app event is rejected due to low reputation, the relay can automatically whitelist you by verifying a `zapstore.yaml` file in your GitHub repository.

**Add `zapstore.yaml` to your repository root:**

```yaml
pubkey: npub1... # or hex format
```

**Make sure your app is open source:**

```json
{
  "kind": 32267,
  "tags": [
    ["repository", "https://github.com/yourname/your-app"],
    ...
  ]
}
```

When your event arrives, the relay fetches the file from your repo, verifies the pubkey matches, and whitelists you. Future events pass immediately.

**Note:** Only GitHub repositories are supported for auto-whitelisting at this time.

### Security model

Your pubkey is permanently linked to your GitHub username in relay records. If malware is detected:
- Your pubkey is blacklisted
- Your GitHub username is flagged
- Future whitelisting attempts via any repo under that username are rejected -->