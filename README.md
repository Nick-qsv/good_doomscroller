# Good Doomscroller

[Read at gdscroll.com](https://gdscroll.com).

A reading feed of short, thoughtful passages from public-domain literature.
Filter by book, theme, or both, pause on an idea, and like or dislike what you
read. No sign-up required.

Every published quotation can be checked against its preserved source through
**Verify quote**, with the surrounding text and downloadable evidence. **AI
context** appears when you click a quote and adds a separate, clearly labeled
interpretation; it may be inaccurate and is not part of the original quotation
or its verification. Reading controls let you choose a font and text size;
your browser remembers those preferences.

To run locally with Docker:

```sh
docker compose up --build
```

Open [localhost:3000](http://localhost:3000).

See [Contributing](CONTRIBUTING.md), [Adding a book](docs/adding-books.md), and
[How verification works](docs/verification.md) to get involved.

The feed remembers loaded quotes in this browser and serves unseen ones first
across visits. Scrolling continues with the least recently served quotes once
the current library is exhausted. See [Growing the library](docs/library-growth.md)
for preparing source-verified review batches and expanding the catalogue.

The site collects optional first-party usage events with temporary session
identifiers. See [Analytics and privacy](docs/analytics.md) for the event contract
and retention limits. Analytics start only after acceptance in the cookie popup;
readers can change their choice at `/privacy`.

Code is licensed under [MIT](LICENSE). Literary works and corpus metadata have
separate [data licensing rules](DATA_LICENSE.md).
