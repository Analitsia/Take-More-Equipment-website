-- The two vocabularies an order needs.
--
-- Their own file, and not the one that creates the tables, for the reason
-- 20260807090000_extensions_and_enums.sql states and 20260808090000 had to
-- prove: `alter type … add value` cannot run in the same transaction that uses
-- the type. Adding a third payment method one day must not mean editing the
-- file that owns `orders`.

-- Three states, and one of them is a mistake rather than a stage.
--
-- There is deliberately no 'awaiting payment'. The salesperson records money
-- that HAS arrived — they check the card machine printed a slip, or that the
-- transfer shows in the account, and only then say so. A machine being held
-- while an EFT clears is already expressible: the item is `reserved` and the
-- order is still `draft`. Two words for one waiting room would let them
-- disagree.
create type public.order_status as enum ('draft', 'paid', 'void');

-- What the app does with these is write them down. Neither one moves money;
-- Take More's card machine and bank do that, and this records which of them it
-- was so the takings can be reconciled at the end of the day.
create type public.payment_method as enum ('card_machine', 'bank_transfer');
