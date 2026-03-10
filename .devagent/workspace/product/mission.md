# Product Mission

## Product
A **client template** for private chefs you land as clients. This repo is the shared starter: you swap templatized values, plug in the specific chef, and build on it based on how custom their needs are relative to the core concepts here. It is a living template—concepts came from your first chef client, you built more from the second, and as you land more chefs the unique ideas from each get folded back in.

## Target Users
- **Primary:** You (agency/developer) — the template is your delivery base for each new private-chef client.
- **End beneficiary:** Private chefs who become your clients and get a tailored storefront (dev demo, then production) built from this project.

## Problem
- Each new chef client would otherwise mean starting from zero or a generic store.
- You need a repeatable, fast path: same stack and core concepts, with clear extension points so client-specific needs don’t blow up scope or timeline.

## Why now
- You already have real demand: first and second chef clients have shaped the concepts. The template exists to scale that playbook without reinventing it per client.

## Solution
- This **monorepo** (Medusa 2 + Remix, Stripe, TypeScript/Biome, env generation, Docker) as the canonical starter.
- **Process:** Swap templatized values → plug in the specific chef → host their dev demo within **two weeks** of their interest → first mock order **about a month** from initial interest.
- **Evolution:** As each new chef brings unique needs, you add the best of those ideas back into this project so future clients start from a richer base.

## Success Metrics
- **Time to dev demo:** Dev/demo version hosted within **2 weeks** of client interest.
- **Time to first mock order:** First mock order placed **~1 month** from initial interest.
- **Template leverage:** New clients start from this repo with templatized swap + chef-specific customizations; unique ideas from clients are captured here for future use.

## Vision
Success looks like: every new private-chef client gets a project that starts from this template. You consistently hit the 2-week demo and ~1-month first mock order, and the template keeps improving as each chef’s uniqueness is distilled into shared concepts and features.

## Risks and mitigation
- **Scope creep per client:** Keep “how custom they are to the main concepts” as the gate—document core concepts and templatized surface so swaps stay bounded; heavier custom work stays as client-specific branches or modules until it’s proven template material.
- **Medusa/Remix churn:** Track upgrades and document in tech stack; use `devagent update-tech-stack` when dependencies or patterns change.
