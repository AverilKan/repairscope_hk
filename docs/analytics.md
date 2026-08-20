# Analytics

The frontend uses [Vercel Web Analytics](https://vercel.com/docs/analytics) via
the `@vercel/analytics` package, mounted once in
[`apps/web/app/layout.tsx`](../apps/web/app/layout.tsx).

This gives us basic, automatic metrics for the current Hobby plan: visitors,
page views, routes, referrers, UTM parameters, countries, devices, browsers,
and operating systems. No custom events (`track()`), no other analytics
provider, and no PII or case data is deliberately sent to Vercel.

## UTM convention for pilot marketing links

Use these four parameters on any link shared for the pilot:

- **`utm_source`** — the platform/community: `facebook`, `whatsapp`,
  `instagram`, `referral`
- **`utm_medium`** — the broad channel type: `organic`, `social`, `message`,
  `referral`
- **`utm_campaign`** — a stable campaign name, e.g. `pilot_aug_2026`
- **`utm_content`** — the specific post/group/link variation, e.g.
  `estate_group_01`, `homeowner_post_01`, `bryan_whatsapp_01`

Example:

```
https://simplefixhk.com/?utm_source=facebook&utm_medium=organic&utm_campaign=pilot_aug_2026&utm_content=estate_group_01
```

Rules of thumb:

- Lowercase, underscores instead of spaces.
- Keep `utm_campaign` stable across a pilot phase — don't invent a new
  campaign name for every individual link.
- Vary `utm_content` per placement/post so you can tell links apart.
- Never put personal information or repair details into a UTM value.
