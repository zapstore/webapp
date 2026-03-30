# WORK-002 — NIP-29 Group Bridge

**Status:** In Progress

## Context

The forum uses kind 11 posts with `['h', communityPubkeyHex]` (communi-key / kind 10222 convention).
The relay keypair IS the community keypair — so the community pubkey hex is a valid NIP-29 group ID.
Existing kind 11 posts are structurally valid NIP-29 posts already; no backfill required.

The relay operator controls `relay.zapstore.dev` and will implement NIP-29 enforcement server-side.
This document covers relay-side events to publish and client-side changes required for full compliance.

---

## Relay-side tasks

These events must be signed by the relay keypair (= community pubkey).

### 1. Publish `kind: 39000` — group metadata

```json
{
  "kind": 39000,
  "pubkey": "<community-pubkey-hex>",
  "tags": [
    ["d", "<community-pubkey-hex>"],
    ["name", "Zapstore"],
    ["picture", "<url>"],
    ["about", "<description>"]
  ],
  "content": ""
}
```

- This is a replaceable event (NIP-33 addressable, `d` = group ID).
- Omit `["private"]` (group is public read).
- Omit `["closed"]` if join requests should be honoured; add it to make the group invite-only.
- Update this event whenever name/picture/about changes (relay re-signs and republishes).

### 2. Publish `kind: 39001` — admin list

```json
{
  "kind": 39001,
  "pubkey": "<community-pubkey-hex>",
  "tags": [
    ["d", "<community-pubkey-hex>"],
    ["p", "<admin-pubkey-hex>", "admin"]
  ],
  "content": ""
}
```

- One `p` tag per admin with their role label.
- Re-publish the full event whenever the admin set changes (it is replaceable).

### 3. Publish `kind: 39002` — member list

```json
{
  "kind": 39002,
  "pubkey": "<community-pubkey-hex>",
  "tags": [
    ["d", "<community-pubkey-hex>"],
    ["p", "<member-pubkey-hex>"],
    ["p", "<member-pubkey-hex>"]
  ],
  "content": ""
}
```

- Re-publish the full event whenever membership changes.
- If the group is open (no `["closed"]` in 39000), this list grows via accepted `kind: 9021` requests.

### 4. Relay enforcement logic

The relay must:

- Accept `kind: 9021` (join request) from any pubkey; add pubkey to member set and re-publish `kind: 39002`.
- Accept `kind: 9022` (leave request) from existing members; remove pubkey and re-publish `kind: 39002`.
- Accept `kind: 9000` (put-user) only from admin pubkeys; update member/admin set.
- Accept `kind: 9001` (remove-user) only from admin pubkeys; update member/admin set.
- Accept `kind: 9005` (delete-event) only from admin pubkeys; remove target event.
- Reject any event missing `['h', '<community-pubkey-hex>']` that is addressed to the group.
- If group is `restricted`, reject posts from pubkeys not in the member set.

---

## Client-side tasks

### 5. Add `previous` tag to published forum posts

NIP-29 requires published events to reference 3+ recent event IDs seen on the relay (first 8 characters each) to prevent out-of-context rebroadcast. Relays must reject events whose `previous` references are not found in their own database.

**Where:** `handleForumPostSubmit` in `src/routes/community/forum/+page.svelte`

Before signing, fetch the last 50 kind 11 events from the relay (excluding own pubkey), pick at least 3 IDs at random, and add:

```js
['previous', id1.slice(0, 8), id2.slice(0, 8), id3.slice(0, 8)]
```

Add this as a single tag entry on the event before calling `signEvent`.

### 6. Implement `kind: 9021` — join request

Users should be able to join the group. Add a "Join Group" action (can be placed in community layout or a settings modal).

**Event to sign:**

```json
{
  "kind": 9021,
  "content": "",
  "tags": [
    ["h", "<community-pubkey-hex>"]
  ]
}
```

Publish to `FORUM_RELAY`. On success, the relay adds the user to the member set and re-publishes `kind: 39002`. Show confirmation or error.

### 7. Implement `kind: 9022` — leave request

**Event to sign:**

```json
{
  "kind": 9022,
  "content": "",
  "tags": [
    ["h", "<community-pubkey-hex>"]
  ]
}
```

Publish to `FORUM_RELAY`. Show confirmation or error. Place leave action in community settings or profile area.

### 8. Fetch and display `kind: 39000` for group metadata

Replace (or supplement) the kind 10222 fetch with a query for the relay's kind 39000 event.

**Filter:**

```js
{ kinds: [39000], authors: [COMMUNITY_PUBKEY], '#d': [COMMUNITY_PUBKEY], limit: 1 }
```

Use the `name`, `picture`, and `about` fields from this event for display in community header/layout. The kind 10222 event can remain as a fallback during transition.

### 9. Surface membership status in the UI

Query `kind: 39002` to determine if the signed-in user is a member:

```js
{ kinds: [39002], authors: [COMMUNITY_PUBKEY], '#d': [COMMUNITY_PUBKEY], limit: 1 }
```

Check whether the signed-in pubkey appears in a `p` tag. Use this to:

- Show/hide the "Join Group" button.
- Gate the post composer if the group is `restricted`.

### 10. Admin moderation actions

These are signed by an admin pubkey (not the relay keypair) and sent to the relay.

| Kind | Action | Required tags |
|---|---|---|
| 9000 | Add/update member or admin | `['h', groupId]`, `['p', targetPubkey]`, optional role string |
| 9001 | Remove member | `['h', groupId]`, `['p', targetPubkey]` |
| 9005 | Delete event | `['h', groupId]`, `['e', targetEventId]` |

Wire these into the existing `ActionsModal` or a new moderation panel visible only to admins. The relay rejects these events if the signing pubkey is not in the admin set.

---

## Events reference summary

| Kind | Signed by | Purpose |
|---|---|---|
| 39000 | Relay keypair | Group metadata (name, picture, about, flags) |
| 39001 | Relay keypair | Admin list |
| 39002 | Relay keypair | Member list |
| 9021 | User | Join request |
| 9022 | User | Leave request |
| 9000 | Admin | Put-user (add / update role) |
| 9001 | Admin | Remove-user |
| 9005 | Admin | Delete event |

Existing events that require **no changes**:

| Kind | Status |
|---|---|
| 11 (forum post) | Already valid — `h` tag correct |
| 1111 (comment) | Valid — NIP-29 accepts any kind with `h` tag |
| 1985 (label) | Valid — same |
| 10222 (community) | Can coexist; deprecate after 39000 is live |

---

## On Merge

Delete this work packet. Promote the group-ID-as-pubkey decision to `spec/knowledge/`.
