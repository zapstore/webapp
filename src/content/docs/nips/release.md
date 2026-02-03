---
title: Release
next: docs/nips/file-metadata
---

Kind: **30063** from [NIP-51](https://nips.nostr.com/51), release artifact sets.

Group of artifacts of a software release.

## Example

```json
{
    "id": "afd498a267484d94366038f3a1e084b5b368f28762aa1ff7c20c4f161207ce43",
    "pubkey": "78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d",
    "sig": "c68b49eb29c3ce34bb05db6b3848d3915337eb8652c31d447851315d2d892a1f9214331b11703482af753a1b85d99f963ea158c74d79d4323f91ab5c0f2b8f2a",
    "kind": 30063,
    "created_at": 1732315685,
    "content": "  - Performance: Background loading, remove deprecated\r\n  - Bugfix: Themed icons (#152)\r\n  - Feature: Allow sending system info and error report (#149)\r\n  - Bugfix: Revert to previous installer plugin (#170)\r\n  - Bugfix: Success toast displays longer descriptions (#159)\r\n  - Bugfix: Duplicate success toast (#166)\r\n  - Feature: Deeplink signer param support (#151)",
    "tags": [
        [
            "url",
            "https://github.com/zapstore/zapstore/releases/tag/0.1.6"
        ],
        [
            "e",
            "9d2dea099bede47778dd46389733ab5df95815f69c11c96f5010623782ad21fd"
        ],
        [
            "a",
            "32267:78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d:dev.zapstore.app"
        ],
        [
            "d",
            "dev.zapstore.app@0.1.6"
        ]
    ]
}
```
