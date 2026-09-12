# Contributing

Good Doomscroller is an open-source reading feed built from carefully sourced
public-domain literature.

## Development principles

- Every displayed quotation must be reconstructed from and verified against
  its recorded source text.
- Model output may rank or identify source spans, but it must never become the
  displayed quotation directly.
- AI context must remain clearly labeled, grounded in the surrounding source,
  and separate from the quotation and its verification.
- Keep reader tracking minimal. Do not add advertising identifiers or raw IP
  address storage.
- Prefer a small, understandable system over new services and dependencies.

## Local development

With Python 3.11+ and Node.js 22 installed, run `make setup`, then `make dev`.
The web app opens at [localhost:3000](http://localhost:3000). For the complete
local app and database, use `docker compose up --build`.

## Pull requests

Run `make lint`, `make test`, and `make build` before opening a pull request.
Explain what changed and how you checked it. Keep changes focused and avoid
committing local environment files, credentials, or deployment records.

New books must include a completed manifest, a stable source URL, a source
digest, and an edition-specific rights basis. Read every selected passage and
its context before proposing publication; an exact match alone does not ensure
a complete or useful excerpt.

See [Adding a book](docs/adding-books.md) for the workflow and
[Source-to-quote verification](docs/verification.md) for the integrity contract.
