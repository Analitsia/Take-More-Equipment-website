-- Give sku and slug column defaults, so the generated types stop demanding them.
--
-- Both are NOT NULL and both are filled by app.items_before_write(). A trigger
-- is invisible to `supabase gen types`, so it saw two required columns and every
-- insert in the codebase — the ops app, the seed script, the tests — had to
-- either pass a fake value or cast the type away.
--
-- Making the default the rule fixes it once, honestly:
--
--   * `sku` defaults to the same generator the trigger uses. The trigger's
--     coalesce short-circuits on a non-empty value, so the sequence still
--     advances exactly once per row.
--   * `slug` cannot have a meaningful default because it derives from the
--     title, so it defaults to empty and the trigger always replaces it. The
--     unique index is the backstop if the trigger is ever disabled.
--
-- next_sku becomes SECURITY DEFINER because a column default executes as the
-- inserting user, and that user has no rights over the sequence in the app
-- schema — nor should it.

create or replace function app.next_sku()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'TME-'
       || to_char(timezone('utc', now()), 'YYMM')
       || '-'
       || lpad(nextval('app.item_sku_seq')::text, 4, '0')
$$;

grant execute on function app.next_sku() to authenticated;

alter table public.items alter column sku  set default app.next_sku();
alter table public.items alter column slug set default '';
