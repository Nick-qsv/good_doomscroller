# Analytics and privacy

The site collects optional first-party usage events in `analytics_events` to
understand traffic, reading activity, feature use, and reported failures. The
browser collector, event validation, storage schema, privacy controls, and
retention command are part of this repository. Readers can review the site's
short privacy notice and change their cookie choice at `/privacy`.

## Event contract

| Event | Meaning of `value`, when present |
| --- | --- |
| `page_view` | Canonical page route viewed; no numeric value |
| `engagement` | Incremental foreground active milliseconds, at most 30,000 per event |
| `passage_view` | One-based position in the feed |
| `passage_read` | Incremental active passage milliseconds, at most 30,000 per event |
| `ai_context_view` | AI interpretation viewed |
| `reaction` | Successful new state: -1 dislike, 0 cleared, 1 like |
| `verification_open` | Quote verification opened |
| `source_open` | Original source opened |
| `proof_expand` | Verification evidence expanded |
| `proof_download` | Verification proof download requested |
| `source_download` | Preserved source download requested |
| `feed_load` | Number of returned passages, from 0 through 20 |
| `feed_error`, `reaction_error` | Observed operation failed |
| `feed_end` | End of the feed reached |
| `back_to_top` | Return-to-top control used |

`POST /api/analytics` accepts JSON batches of 1 through 20 events, bounded to
16,384 bytes. Each event supplies a UUID event ID, temporary session UUID,
recognized event name, and supported page path. Content events also identify a
passage. The server validates numeric ranges, discards arbitrary metadata, and
stores only the defined fields. Duplicate event IDs are ignored.

Stored page routes are canonical `/` or `/passages/:id/verification` patterns.
The collector does not retain URL queries or fragments. Referrer attribution
retains only an external hostname, and device/browser values are coarse
categories derived from the request's user agent.

The endpoint checks the request origin and uses a separate request budget from
feed, reaction, and download requests. Invalid input is rejected before storage.
Accepted events receive HTTP 202. Disabled collection, recognized bots, privacy
preferences, and deployments without a configured database receive HTTP 204.
The response does not contain stored event data.

## Interpreting activity

Analytics uses temporary session identifiers in browser session storage, not
accounts or persistent visitor identifiers. A session rotates after 30 minutes
without recorded activity. **Sessions are not unique people.** One person may
create several sessions or tabs, and several people may share a browser.

Active website time and active passage time overlap and must not be added.
Passage exposure and active time are attention proxies, not proof that somebody
read or understood the text. Successful reaction events describe changes,
including reversals or removal, rather than the current number of likes.
Reported errors describe observed operations and are not uptime measurements.

Browser blocking, disabled JavaScript, network failures, session resets, and
event validation or rate limits can reduce coverage. Referrers may be suppressed
by browsers and other applications. Accepted events describe observed activity,
not all visits to the site; automated traffic detection is imperfect.

## Privacy controls

Visitors choose Accept or Decline in the cookie popup. Analytics are off until
explicitly accepted, and the choice is saved in this browser's local storage.
The popup stays dismissed after either choice; `/privacy` provides the same
controls to change it later. Global Privacy Control and Do Not Track keep
analytics off and suppress the popup. Declining clears the analytics session and
queued events. Essential feed/reaction cookies and local reading preferences
continue to work regardless of the analytics choice.

The consent key is `good-doomscroller.analytics.consent`. Existing opt-outs are
honored; the former default-on behavior does not count as consent. Visitors
without a saved consent choice are asked before collection begins. Analytics
session identifiers are created only after acceptance, and preference changes
are synchronized across open tabs.

Set `ANALYTICS_ENABLED=false` in the web runtime to stop accepting events.
Building with the same setting also disables the browser collector in rendered
pages. Analytics are discarded when no database is configured; the demo remains
usable without analytics storage.

The event store does not collect raw IP addresses, full user-agent strings,
referrer paths, email addresses, advertising identifiers, fingerprints, or text
typed by visitors. Product events are kept separate from the existing anonymous
reaction identity.

## Retention

Raw event retention has a **90-day target**. During traffic, ingestion attempts
cleanup at most hourly, deleting up to 10,000 expired rows per pass. Quiet sites
and larger backlogs require independent daily maintenance; the traffic-driven
cleanup alone is not a hard retention guarantee. Run this in the existing
authorized application runtime through an operations scheduler:

```sh
node scripts/analytics-prune.mjs
```

For local Docker, use `docker compose exec -T web node scripts/analytics-prune.mjs`.
The maintenance command drains expired events in bounded batches and returns a
nonzero exit status on failure. Check that status when scheduling it. The
repository provides the maintenance command; it does not create a production
scheduler.

Analytics changes do not retroactively remove application, infrastructure, or
access logs managed outside this event store.
