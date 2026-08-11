/**
 * The homepage highlights row.
 *
 * Eight is a display decision before it is a business rule. The row is a
 * marquee, and a marquee only reads as one when its cards are wider than the
 * screen they cross — but a highlight stops being a highlight once everything
 * is one. Eight fills a desktop row twice over, takes a little over a minute to
 * come round, and still leaves the catalogue below it a reason to exist.
 *
 * The number is enforced twice, against two different failures:
 *
 *   · a trigger on `items` refuses the ninth, which stops a worker creating the
 *     problem and tells them why at the moment they try
 *   · the storefront draws at most this many however many it is handed, which
 *     covers rows that predate the trigger or arrive around it — a seeded
 *     database, a repair run in the SQL editor, two people featuring a machine
 *     in the same instant
 *
 * The second is not redundancy for its own sake. The trigger counts rows and
 * cannot be atomic against a concurrent insert without a lock that costs more
 * than the problem; the slice makes that race a flag nobody sees rather than a
 * ninth card on the homepage.
 */
export const MAX_FEATURED = 8;
