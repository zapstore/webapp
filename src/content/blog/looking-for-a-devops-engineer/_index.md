---
title: Looking for a DevOps engineer
date: 2026-03-24
draft: false
---

Zapstore is a permissionless app store built on Nostr. We're at thousands of daily users and growing, the backend is Go, and we're looking for a part-time DevOps/Go engineer to help us keep up with it.

## What you'll actually be doing

The backend runs on regular/disposable Linux VPSs. Nostr relays, Blossom servers, an indexer that finds and processes app updates, an AI-powered sentinel and more. Keeping those services healthy is part of it — environments (dev/staging/production), automation, backups, observability.

But the bigger part is development. We have an ambitious roadmap and a lot of it runs through the indexer: new features, better app claiming, finer-grained error detection, performance work. As the catalog grows, the indexer needs to handle significantly more events without falling over, and the infrastructure needs to scale with it. This is not a purely operational role.

You'll also need to get comfortable with zsp, our CLI for publishing apps to Nostr relays. Some of the claiming workflow, for example, spans both the indexer and zsp, so expect to work across many different projects.

## What we're not looking for

No Kubernetes. No Terraform. No AWS-specific anything. If a solution only works on a particular provider, it's the wrong solution. Things should run on a generic Linux box rentable from any reasonable VPS provider.

Ansible or something similarly straightforward over orchestration systems that need their own ops team. Simple, portable.

We don't need new infrastructure provisioned right now. That'll come, but it's not the immediate problem.

## What matters

Go. Not an expert, but you need to be able to read the codebase, understand what's happening, and contribute meaningfully. The services are not large.

Standard ops competence: containers, CI/CD pipelines, environment management, backup strategies, basic monitoring. Nothing exotic.

The freedom tech angle is real. This is permissionless infrastructure built on the premise that trusted third parties are a liability. You don't have to be a maximalist, but you should understand the threat model and have some instinct for it when making tradeoffs.

Nostr familiarity is a big bonus. If you've run a relay, know your way around NIPs, or have published events to one, even better.

We communicate internally via a Signal group. The team is small and things move fast. No expectation of around-the-clock incident response, but if something breaks badly and you can react — that matters. Otherwise: show up, respond, flag problems early, speak up when something is off. Remote but not a black box.

## One more thing

We use LLMs and agents extensively and expect you to do the same — not just knowing the tools exist, but using them to their full potential, understanding their failure modes, and knowing how to keep the output from being slop. Good judgment over the output matters more than output volume.

We also have an eye on autonomous agent infrastructure: skills, apps, tools should be discoverable, published, vetted without human intervention. If that problem space is interesting to you, there's room to work on it here.

## To apply

Send us a DM on Nostr: [zapstore](https://npub.world/npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8).
