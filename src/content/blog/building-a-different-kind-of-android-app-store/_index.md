---
title: Building a different kind of Android app store
description: 
date: 2026-06-08
draft: false
---

This blog has been quiet for a while.

Zapstore has [not](https://github.com/zapstore/zapstore/blob/master/CHANGELOG.md).

Apps have been added. Bugs have been fixed. People have asked good questions. People have asked the same good questions three days later. Developers have published apps. Users have compared Zapstore to F-Droid, Obtainium, random APK downloads, and whatever else Android people use once they are deep enough in the rabbit hole to have strong opinions about package managers.

So we should probably start writing more of this down.

Zapstore is an open Android app store where apps can be published by developers and curated by communities.

The short version is:

> The Open Android App Store.

That sounds simple, but it opens the door to a lot of questions.

Who gets to publish software? Who gets to decide what is allowed? How do users know what they are installing? How do developers reach people without depending on giant platforms? How do communities help each other discover good apps without turning everything into engagement farming?

These are not small questions. And they do not fit very well into a release note, a Nostr reply, or a meme about Google Play holding your APK hostage.

![Android developer looking at Zapstore while Google Play watches](./android-dev-zapstore-meme.png)

The Android world already has many tools trying to solve different parts of this problem.

Google Play is convenient, but centralized. F-Droid was revolutionary, but has its own model and tradeoffs. Obtainium can work, if you already know which app you want and exactly where it comes from. Direct APK downloads can feel like downloading `totally-not-malware.apk` from a website that has not changed since 2009.

Zapstore is trying something different.

It combines app discovery, developer publishing, community curation, trust signals, updates, and direct support into one place.

It is not Google Play, but purple. It is not F-Droid, but with zaps.

It is an attempt to rethink how Android app distribution could work if the relationship between users, developers, and communities was more direct.

That is exciting. It is also messy.

Zapstore is still early. There are rough edges. Some concepts need better explanations. Some flows need improvement. Some trust questions deserve more than “don’t worry bro”.

If people are going to install apps outside the default store path, they should understand what they are doing, what Zapstore helps with, and what still requires judgment.

That is one reason we want to use this blog more.

We want this to become a place for longer explanations, guides, comparisons, product updates, developer notes, and the occasional “here is what we learned from something breaking in public”.

Some of the things we want to write about:

- what Zapstore is and how it works
- how to install and use Zapstore without getting lost in Android warning screens
- how app publishing works for developers
- how Zapstore reasons about signing, provenance, Web of Trust, and trust signals
- how it compares with Google Play, F-Droid, Aurora, Obtainium, and others
- what apps and communities are joining the ecosystem
- what we are building next
- what still needs to improve

Some posts will be for users. Some will be for developers. Some will be for people who care about Android freedom, open-source software, privacy, Nostr, Bitcoin, or simply being able to install the apps they want without asking a corporate priesthood for approval.

The blog should also help us avoid explaining the same thing badly in five different places.

If someone asks “is Zapstore safe?”, if a developer asks “why should I publish here?”, there should be a real answer.

We want a different model for app distribution, and that requires more than code. We need clear explanations. Honest tradeoffs. Better onboarding. We need developers to understand why publishing here matters. We need users to know what they are installing and why it is worth trying.

![Developer submitted APK to Google Play meme](./google-play-submission-meme.png)

The blog is waking up.

Expect more writing here soon.

And if there is a topic you want covered, an app you want to see on Zapstore, or a question that still feels unclear, let us know.

In the meantime:

- [Browse apps](https://zapstore.dev/apps) on Zapstore
- [Publish](https://zapstore.dev/docs/publish) your Android app
- [Read the FAQ](https://zapstore.dev/community/faq)
- [Follow us on Nostr](http://njump.me/nprofile1qqs83nn04fezvsu89p8xg7axjwye2u67errat3dx2um725fs7qnrqlgzqtdq0) for updates

We are building this in public, and the best way to shape it is to use it.
