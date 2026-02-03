---
title: App
weight: 1
next: docs/nips/release
---

Kind: **32267** from [NIP-82 (PR)](https://github.com/nostr-protocol/nips/pull/1336).

This NIP defines kind 32267 to represent a software application.

## Application

```json
{
  "kind": 32267,
  "content": "<description>", // Description of the application, markdown is allowed
  "tags": [
    ["d", "<app-id>"], // Usually reverse domain notation: com.example.app
    ["name", "<human-readable project name>"], // Name: Example App
    ["icon", "<icon-url>"], // Icon URL
    ["image", "<image-url>"], // Image URL, can be used multiple times
    ["t", "<tag>"], // Tags related to the application, can be used multiple times
    ["url", "<website-url>"], // Website URL for the app
    ["repository", "<repo-url>"], // Source code repository URL: https://github.com/example/android
    ["a", "30617:<destination-pubkey>:<repo-id>", "<relay-url>"], // Pointer to NIP-34 repository
    ["a", "30063:<destination-pubkey>:<app-id>@<version>"], // Pointer to the latest NIP-51 release artifact set
    ["commit-id", "<sha1-commit-id>"], // SHA1 commit id used to build the release
    ["f", "<platform-identifier>"], // Platform identifier, can be used multiple times 
    ["license", "<spdx-id>"] // License ID
  ]
}
```

All tags are optional but the `d` tag MUST be present. Applications SHOULD use their  application or bundle identifier as the `d` tag, which typically is an ID with dots in reverse-domain notation.

For `icon` and `image` tags any URL is valid but a Blossom [BUD-01](https://github.com/hzrd149/blossom/blob/master/buds/01.md#get-sha256---get-blob) endpoint is recommended.

License IDs are SPDX IDs as defined in https://spdx.org/licenses/.

An `a` tag reference to the latest 30063 event SHOULD be present to facilitate discovering the latest release of an app. Similarly, `f` tags SHOULD be included to describe supported platforms that MUST match predefined identifiers.

### Platforms

Platform is defined as the specific underlying system on which the application is executed, a combination of operating system and hardware architecture. We use the `f` tag for this purpose, with the following identifiers loosely based off `uname -sm`:

| Identifier             | OS              | Architecture      |
| ---------              | ---             | ---               |
| `android-arm64-v8a`    | Android         | ARMv8-A           |
| `android-armeabi-v7a`  | Android         | ARMv7-A           |
| `android-x86`          | Android         | x86               |
| `android-x86_64`       | Android         | x86-64            |
| `darwin-arm64`         | MacOS           | ARM64             |
| `darwin-x86_64`        | MacOS           | x86-64            |
| `linux-aarch64`        | Linux           | ARM64             |
| `linux-x86_64`         | Linux           | x86-64            |
| `windows-aarch64`      | Windows         | ARM64             |
| `windows-x86_64`       | Windows         | x86-64            |
| `ios-arm64`            | iOS             | ARM64             |
| `web`                  | (Web browsers)  | -                 |

### Attribution

App authors MAY include their pubkeys as `p` tags and `zap` tags as per [NIP-57 - Appendix G](https://nips.nostr.com/57). This is useful in the case of an author other than the one who signed the event, or multiple authors.

## Usage

A kind 30063 [release artifact set](https://nips.nostr.com/51) SHOULD have an `a` tag reference back to this event, alongside its references to `"e"` [file metadata](https://nips.nostr.com/94) events.

## Example

```json
{
    "id": "18263af7904801e06e3c9f25d37e0a49ec27751dbe3e11e1b476ed43c04c3ee6",
    "pubkey": "78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d",
    "sig": "5c4197e30adfcae065f3a3f0d41ce5da440cf35817b7ebec9cb69bb148fcf5bd1688e44796bd67dcf825272c8947791c7faff81b379ad79298ce0e7944574b14",
    "kind": 32267,
    "created_at": 1732315685,
    "content": "The social permissionless app store",
    "tags": [
        [
            "icon",
            "https://cdn.zapstore.dev/5509e42f3ccd45b7011b461dfa16cfd3b5a4d2e34d0af583473f3c63fdc45eb0"
        ],
        [
            "name",
            "Zapstore"
        ],
        [
            "repository",
            "https://github.com/zapstore/zapstore"
        ],
        [
            "url",
            "https://zapstore.dev"
        ],
        [
            "license",
            "MIT"
        ],
        [
            "f",
            "android-arm64-v8a"
        ],
        [
            "t",
            "android"
        ],
        [
            "t",
            "apk"
        ],
        [
            "t",
            "app"
        ],
        [
            "t",
            "appstore"
        ],
        [
            "t",
            "grapheneos"
        ],
        [
            "t",
            "lightning"
        ],
        [
            "t",
            "lightning-network"
        ],
        [
            "t",
            "nostr"
        ],
        [
            "t",
            "obtainium"
        ],
        [
            "t",
            "permissionless"
        ],
        [
            "t",
            "playstore"
        ],
        [
            "t",
            "sha256"
        ],
        [
            "t",
            "social-graph"
        ],
        [
            "t",
            "weboftrust"
        ],
        [
            "a",
            "30063:78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d:dev.zapstore.app@0.1.6"
        ],
        [
            "d",
            "dev.zapstore.app"
        ]
    ]
}
```