<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Public time-clock writes must pass through server functions, enforce ordered marks and QR expiry, and record supervisor/public audit trails; this prevents bypassing attendance controls from the browser.
- Time-clock selfies are human-review evidence with explicit consent and configurable retention, not biometric liveness proof; this keeps the product claim aligned with implemented validation.
- Billing V2 is derived from database-deduplicated final participations with server-side plan gates and cycle price snapshots; browser state cannot authorize paid operations or set invoices.
- Keep SaaS invoices separate from worker funding and gateway costs; payout and collection paths must never generate legacy percentage fees.
- Resolve platform and organization contexts exclusively; legacy company links must not grant platform accounts tenant capabilities.
- Support reads require a caller-owned open audited attendance and explicit ownership-chain filters; support money-moving endpoints fail closed.
- Master global summaries use authenticated RLS reads; privileged account changes verify master authority before loading the administrative client.
