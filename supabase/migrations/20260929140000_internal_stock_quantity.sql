-- Manual count for staff. NULL means not counted yet; zero is a known count.
-- Keep this out of public_items and the anon column grants.
alter table public.items
  add column stock_quantity integer
  constraint items_stock_quantity_nonnegative check (stock_quantity >= 0);

comment on column public.items.stock_quantity is
  'Internal manual unit count. Does not drive publication, orders or payments.';
