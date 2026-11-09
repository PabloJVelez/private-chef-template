# Scheduling

Internal Medusa 2.7 module for the single chef's protected time. Both `held` and
`confirmed` reservations occupy finite, ordered, half-open PostgreSQL intervals.
The exclusion constraint decides concurrent overlaps; adjacency is allowed.
Requests do not reserve time. There is no expiry, public mutation API, resource
registry, recurrence model or second workflow engine.

`acquire` binds a reservation ID to one owner, attempt and exact interval. An
identical retry returns the same reservation; changed ownership/timing and reuse
after release fail. `confirm` and `release` condition on the same ownership.
Private Events must make finalization impossible before issuing release: this
module owns occupied time, while the client owns its lifecycle and authorization.

`overlapping` includes reservations starting before the requested window. It
accepts at most 40 days, uses one PostgreSQL snapshot and a five-second statement
timeout, and throws instead of returning partial results above 10,000 rows.
Read errors must propagate to the caller, never become an empty busy list.

Methods use `InjectManager`, `InjectTransactionManager` and `MedusaContext`.
Callers may supply a module-local transaction context. Do not pass a different
module's manager or use generated CRUD methods to bypass reservation commands.

The first migration is additive. Application registration, historical-data
transfer and retirement of the old Private Event authority belong to the
integration milestone, not an empty-table deployment.

From the repository root, on an explicitly verified local PostgreSQL server:

```sh
BOOKING_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
node .yarn/releases/yarn-4.5.0.cjs workspace medusa test:integration:http \
  --runTestsByPath integration-tests/http/scheduling-domain.spec.ts
```

The test creates/drops only a random `booking_test_scheduling_*` database. It does
not reset the application's database or require another manually managed server.
The HTTP-suite entry launches a fresh Jest process for the Medusa module fixture;
this avoids Medusa 2.7's process-global MikroORM metadata colliding with the
existing single-module integration runner. Missing database configuration fails
the selected suite rather than silently skipping the proof.
