---
title: Publishing apps
weight: 10
---

Run `zapstore publish` in a folder with a `zapstore.yaml` config file (recommended to be in the root of your project). Alternatively supply its path via the `-c` argument.

(Need the `zapstore` tool? Get it [here](#download-zapstore-cli) for your platform of choice.)

## Quickstart (Android)

Example of a minimal config for pulling from an open source Github project:

```yaml
repository: https://github.com/your/repo
assets:
  - .*.apk
```

(Yes, asset paths are regular expressions.)

By default this will parse the APK and determine icon, name, version, certificates and more. It will also pull additional metadata (description, images) from Github.

Do you have additional metadata in Play Store or F-Droid? Use:

```yaml
repository: https://github.com/your/repo
assets:
  - .*.apk
remote_metadata:
  - playstore
  - fdroid
  - github
```

Example of a minimal `zapstore.yaml` config for local assets. The `assets` list is required.

```yaml
assets:
  - output/.*.apk
```

**Anyone with an active npub can publish their apps to `relay.zapstore.dev` without permission**. If you run into issues contact us!

For more options, keep reading.

## Parsers

Convention over configuration is the way. The main `AssetParser` aims to require as little information as possible to work. It will extract as much as possible from supplied assets, particularly from Android APKs.

**Currently supported platforms**:
 - Android arm64-v8a (`android-arm64-v8a`)
 - MacOS arm64 (`darwin-arm64`)
 - Linux amd64 (`linux-x86_64`)
 - Linux aarch64 (`linux-aarch64`)

Most properties can be overridden in the configuration, and additional information can be pulled from remote metadata sources such as Github and Google Play Store.

The asset parser has two additional subclasses: `GithubParser` and `WebParser`. In the remainder of this documentation we will focus on local (default) and Github parsing.

**If `assets` contain a forward-slash they are considered to be local, otherwise they are looked up on Github, provided there is a defined `repository`.**

Below is a full config example with all supported properties:

```yaml
identifier: com.sample.app
version: 1.0.0
name: Sample
summary: Sample summary
description: Just a sample APK
repository: https://github.com/sample/android
release_repository: https://github.com/sample/android-releases
homepage: https://zapstore.dev
images:
  - test/assets/i1.jpg
  - test/assets/i2.jpg
icon: test/assets/icon.png
changelog: CHANGELOG.md
tags: freedom-tech sample android
license: MIT
remote_metadata:
  - playstore
  - github
blossom_servers:
  - https://cdn.zapstore.dev
  - https://blossom.band
assets: # for local
  - test/assets/.*.apk
# or
assets: # for github
  - \d+\.\d+\.\d+-arm64-v8a.apk
executables:
  - ^sample-.*
```

Notes on properties:
  - `identifier`: Main identifier that will become the `d` tag in the app event. Mostly useful for CLI apps, in Android identifier will be extracted from the APK. Can be derived from the last bit of `repository` if on Github, or from `name`.
  - `version`: Version being published, only really useful for CLI apps published from a local source, in Android version will be extracted from the APK
  - `name`: App name, if not supplied it will be derived from the identifier. Can be pulled via remote metadata like Google Play Store, for example
  - `summary`: Short sentence describing this app. Can be pulled from remote metadata.
  - `description`: Longer description of the app, markdown allowed. Can be pulled from remote metadata. Can be derived from `summary`.
  - `repository`: Source repository. If on `github.com`, releases will be looked up via Github API
  - `release_repository`: If source repository is missing (closed source apps) or releases are found here instead
  - `homepage`: App website
  - `images`: List of image paths. Only local paths supported.
  - `icon`: Icon path. Only local path supported.
  - `changelog`: Local path to the changelog in the [Keep a Changelog](https://keepachangelog.com) format, release notes for the resolved version can be extracted from here, defaults to `CHANGELOG.md`
  - `tags`: String with tags related to the app, separated by a space
  - `license`: Project license in [SPDX](https://spdx.org/licenses/) identifier format
  - `remote_metadata`: List of remote metadata sources, currently supported: `playstore`, `github`. More coming soon.
  - `blossom_servers`: List of Blossom servers where to upload assets, only applies to local assets. Includes `icon` and `images`, whether local or pulled via `remote_metadata`. If any upload fails the program will exit as events contain URLs to these Blossom servers which need to be valid.
  - `assets`: List of paths to assets **as regular expressions**. If paths contain a forward-slash they will trigger the local asset parser, if they don't, the Github parser (as long as there is a `github.com` repository). If they are an HTTP URI, the Web parser. If omitted, the list defaults to a single `.*` which means all assets in Github release, if applicable.
  - `executables`: Strictly for CLI apps that are packaged as a compressed archive, a list of in-archive paths as regular expressions. If omitted, all supported executables (see supported platforms above) inside the archive will be linked and installed.

Supported compressed archive formats: ZIP, and TAR, XZ, BZIP2 (gzipped or not).

If you need assistance producing a `zapstore.yaml` config file, please reach out via nostr.

### Real world examples

This program:

```yaml
name: zapstore
version: 0.2.4
description: The permissionless package manager
repository: https://github.com/zapstore/zapstore-cli
license: MIT
assets:
  - bin/.*
```

Zapstore Android app:

```yaml
name: Zapstore
repository: https://github.com/zapstore/zapstore
icon: assets/images/logo.png
license: MIT
remote_metadata:
  - github
```

Alby Go:

```yaml
name: Alby Go
summary: The easiest mobile app to use bitcoin on the Go!
repository: https://github.com/getAlby/go
homepage: https://albygo.com/
assets:
  - alby-go-v\d+\.\d+\.\d+-android.apk
remote_metadata:
  - github
  - playstore
```

nak:

```yaml
repository: https://github.com/fiatjaf/nak
assets:
  - nak-v\d+\.\d+\.\d+-darwin-arm64
  - nak-v\d+\.\d+\.\d+-linux-amd64
  - nak-v\d+\.\d+\.\d+-linux-arm64
remote_metadata:
  - github
```

Phoenix for servers (includes `phoenixd` and `phoenix-cli` inside the archive):

```yaml
repository: https://github.com/acinq/phoenixd
assets:
  - phoenixd-\d+.\d+.\d+-macos-arm64.zip
  - phoenixd-\d+.\d+.\d+-linux-x64.zip
  - phoenixd-\d+.\d+.\d+-linux-arm64.zip
```

## Signing and publishing

Supported signing methods:
 - nsec
 - NIP-07 (opens a web browser with an extension)
 - NIP-46 (requires `nak` which can be installed with `zapstore i nak`)

They are all supplied via the `SIGN_WITH` environmental variable. `.env` file is supported and recommended. Example:

```bash
SIGN_WITH=176fa8c7a988df001bc062ce1443e5b8d3f24913b54ec49d322ddd638d0c17aa
SIGN_WITH=NIP07
SIGN_WITH=bunker://9fb1f82f03c40b6063e95f18ce9006d5a3b15fc05dd244d230c12a4e21fe304c?relay=wss%3A%2F%2Frelay.primal.net%2F&secret=87412ffe-4e3e-551e-97fc-5686ac74bf23
```

If no `SIGN_WITH` env var is found, events will be produced and printed to stdout, so it's possible to:

`zapstore publish | nak event --connect bunker://... wss://relay.zapstore.dev` as well (or take those events to any other signer!).

Please note that uploading to Blossom servers will also require signing Blossom authorization events of kind 24242.

The ability of pasting an nsec found in previous versions was removed. If you don't want to include your nsec in an `.env` file, here is the recommended command:

```bash
 SIGN_WITH=176fa8c7a988df001bc062ce1443e5b8d3f24913b54ec49d322ddd638d0c17aa zapstore publish
```

(Notice the leading space, this will prevent your shell from saving this command in history.)

Events are only published to `relay.zapstore.dev` for now (this will change in the near future). Your pubkey must be whitelisted by zapstore in order for your events to be accepted. Get in touch!

## Program arguments

Can be found with `zapstore publish --help`.

```bash
Publish a package

Usage: zapstore publish [arguments]
-h, --help                      Print this usage information.
-c, --config                    Path to the YAML config file
                                (defaults to "zapstore.yaml")
    --[no-]overwrite-app        Fetches remote metadata and overwrites latest app on relays
                                (defaults to on)
    --[no-]overwrite-release    Overwrites latest release on relays
    --[no-]indexer-mode         Run publish in indexer mode (non-interactively and without spinners)
    --[no-]honor                Indicate you will honor tags when external signing

Run "zapstore help" to see global options.
```

If the release exists on relays, the program will show a warning and exit unless `--overwrite-release` was passed (default off).

Metadata will only be fetched if `--overwrite-app` (default on).

## Updating

Run `zapstore update zapstore`. You may need to follow instructions to install the program.

## Download Zapstore CLI

Verify the downloaded file on your terminal or use [Who Signed This File](https://npub1p763d86hsj7xzggqeddy7u3hwlg9ku4twar3tvst3uyp9g88ncvqcj7hur.nsite.lol/) which reveals that it was signed by Zapstore.

### MacOS

```bash
curl -sL https://cdn.zapstore.dev/88c82772eee5c262a0a2553f85a569004ebee54b1636f080ec930f314ac01b1d -o zapstore
shasum -a 256 zapstore # MUST be equal to the URL path above
chmod +x zapstore
```

[Download](http://cdn.zapstore.dev/88c82772eee5c262a0a2553f85a569004ebee54b1636f080ec930f314ac01b1d) 

### Linux

**Important**: You must install the SQLite dependency. On Debian-based systems: `sudo apt install libsqlite3-dev`.

These binaries should also work on Windows/WSL.

#### amd64

```bash
curl -sL https://cdn.zapstore.dev/6e2c7cf6da53c3f1a78b523a6aacd6316dce3d74ace6f859c2676729ee439990 -o zapstore
shasum -a 256 zapstore # MUST be equal to the URL path above
chmod +x zapstore
```

[Download](http://cdn.zapstore.dev/6e2c7cf6da53c3f1a78b523a6aacd6316dce3d74ace6f859c2676729ee439990) 

#### aarch64

```bash
curl -sL https://cdn.zapstore.dev/26ee91aa165695b6d5e81a56c0e095ef681d30843c3fa5a9177edca436b1730d -o zapstore
shasum -a 256 zapstore # MUST be equal to the URL path above
chmod +x zapstore
```

[Download](http://cdn.zapstore.dev/26ee91aa165695b6d5e81a56c0e095ef681d30843c3fa5a9177edca436b1730d) 