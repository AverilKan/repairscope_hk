# Analytics

The frontend uses [Vercel Web Analytics](https://vercel.com/docs/analytics)
via the `@vercel/analytics/next` package, mounted once in
[`apps/web/components/SafeAnalytics.tsx`](../apps/web/components/SafeAnalytics.tsx)
(rendered from the root layout,
[`apps/web/app/layout.tsx`](../apps/web/app/layout.tsx)).

## Fail-closed route allowlist

Analytics only reports page views for a narrow, explicit allowlist of safe
public routes, enforced by
[`apps/web/domain/analyticsPrivacy.ts`](../apps/web/domain/analyticsPrivacy.ts):

- `/`
- `/privacy`
- `/terms`
- `/landlord/repairs/new` and its descendants

Every other route — including `/operator/*`, `/contractor/*`,
`/contractor/respond/*`, `/respond/*`, authenticated landlord dashboard/case
pages, `/sign-in`, `/sign-up`, and any future route not consciously added
here — is dropped before it reaches Vercel. This is deliberate: several of
those routes carry sensitive values in the URL itself (contractor bearer
tokens, operator case references), and the safest default is to exclude
everything not explicitly reviewed and allowlisted.

For every allowed event, the query string and URL fragment are stripped
before the URL is sent — no query parameter value (UTM or otherwise) ever
reaches Vercel through `event.url`. A URL that can't be parsed is dropped
outright rather than sent as-is.

No custom events (`track()`) are used, and no other analytics provider is
installed. No PII or case data is deliberately sent to Vercel.

## UTM naming convention

Because query parameters are stripped before analytics transmission, **UTM
parameters are not currently a source of truth for pilot measurement** on
this Vercel Hobby plan — the current Vercel product documentation places UTM
parameter reporting under Web Analytics Plus, a higher tier than what this
project runs on today.

We still keep a lowercase, underscore-separated naming convention for
marketing links, mainly so links are consistent and portable if a future
plan or a different tool picks them up:

- **`utm_source`** — the platform/community: `facebook`, `whatsapp`,
  `instagram`, `referral`
- **`utm_medium`** — the broad channel type: `organic`, `social`, `message`,
  `referral`
- **`utm_campaign`** — a stable campaign name, e.g. `pilot_aug_2026`
- **`utm_content`** — the specific post/group/link variation, e.g.
  `estate_group_01`, `homeowner_post_01`

Example:

```
https://simplefixhk.com/?utm_source=facebook&utm_medium=organic&utm_campaign=pilot_aug_2026&utm_content=estate_group_01
```

Rules of thumb:

- Lowercase, underscores instead of spaces.
- Keep `utm_campaign` stable across a pilot phase — don't invent a new
  campaign name for every individual link.
- Vary `utm_content` per placement/post so links are distinguishable if
  reviewed manually (e.g. in referrer logs) — do not use people's names or
  other identifying information in `utm_content` values.
- Never put personal information or repair details into a UTM value.
