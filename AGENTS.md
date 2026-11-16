# Project Agent Guidance

## Medusa architecture is a requirement

- Follow Medusa's supported module, service, dependency-injection, workflow and transaction patterns. Do not take shortcuts or add speculative concurrency machinery that breaks those boundaries.
- Each module owns its data. Never read or write another module's tables or pass a transaction manager between modules. Coordinate through public module-service methods resolved in a workflow/application orchestration layer; use Medusa links/query where appropriate.
- Keep atomic domain invariants inside the owning module. Before adding locks or bypassing a service, trace the actual writers and existing lifecycle guards. A cross-module boolean read is not a lock, and a workflow is not one shared database transaction. Prove relevant interleavings with focused tests.
- Depart from a supported Medusa pattern only for a demonstrated framework bug that prevents it. Document the affected version, reproduction/evidence, supported alternatives tried, why they fail, the narrowly scoped workaround, regression coverage, and removal/recheck condition in project docs and at the workaround. Convenience, hypothetical races, or over-engineering are not exceptions.
- The existing global Admin mount is an explicitly accepted UI integration trade-off to recheck on Medusa upgrades. It is not permission to introduce new module-boundary exceptions.

Also follow the applicable development and testing guidance in `.cursor/rules/`, especially `medusa-development.mdc`.
