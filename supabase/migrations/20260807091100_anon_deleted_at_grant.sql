-- Grant anon SELECT on items.deleted_at.
--
-- The three public views are `security_invoker = true`, which means privileges
-- on the base tables are checked against the CALLER — and that check covers
-- every column the view touches, not just the ones it returns. All three filter
-- `where i.deleted_at is null`, so without this grant an anonymous visitor
-- reading public_items gets a flat "permission denied for table items" and the
-- storefront has no catalogue at all.
--
-- Withholding it was over-caution rather than security: the anon RLS policy on
-- items already restricts anon to `deleted_at is null`, so every row it can
-- read carries the same value. There is no information in the column for them.
--
-- The alternative — dropping the predicate from the views — is worse. Staff
-- read these views too, and their policy does not filter soft-deleted rows, so
-- the WHERE clause is load-bearing for authenticated callers.

grant select (deleted_at) on public.items to anon;
