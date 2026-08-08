-- 'workshop' joins the cost vocabulary.
--
-- Its own file, and deliberately empty of anything else: Postgres refuses to USE
-- an enum value in the same transaction that added it, and the migration runner
-- wraps each file in one. Everything that references 'workshop' — the upsert
-- RPC, the seed, the intake form — therefore lives in a later migration.
--
-- Placed next to 'auction' because the two are now a pair: the intake form shows
-- both as fixed boxes rather than as options in a dropdown. cost_kind carries no
-- ordering meaning (unlike app_role, where declaration order IS the privilege
-- test), so this position is presentation only.

alter type public.cost_kind add value if not exists 'workshop' after 'auction';
