# Disposable preview lifecycle verification

This temporary PR verifies that a newly opened same-repository PR receives an
isolated preview from the default-branch workflow and that closing it retires
only its own containers, volumes and Cloudflare routes. It is not intended to
merge. All requests and emails are synthetic; no production integrations run.
