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

## Architecture rules
- All master-data access goes through the `Backend` interface in `src/lib/mdm/store.server.ts`; remote SQL Server API when `MDM_API_URL`+`MDM_API_KEY` are set, in-memory demo otherwise. Why: Workers cannot reach SQL Server directly.
- Business rules (roles, validation, locks, diffs) live in `src/lib/mdm/schema.ts` and are shared by client and server; server re-validates everything. Why: one source of truth, tested in `src/test/mdm-rules.test.ts`.
- Sessions are HMAC-signed tokens passed as server-fn input and verified in every handler. Why: no Supabase auth; users come from SQL Server.
- Records are never deleted; deactivation sets `status`. Every insert/update writes an audit entry with old/new values.
