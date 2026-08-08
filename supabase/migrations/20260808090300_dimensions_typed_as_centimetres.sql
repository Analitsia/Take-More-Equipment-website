-- Correct the dimensions that were typed as centimetres into a millimetre column.
--
-- The intake form now asks for centimetres, because that is what a tape measure
-- in a warehouse reads and what everybody was typing anyway. Storage stays in
-- millimetres: it is the finer unit, it stays an integer, and it lets the form
-- accept a half-centimetre without a numeric column — exactly the arrangement
-- money already has here, where the database holds cents and every screen shows
-- rands. The single conversion lives in the form and the storefront's renderer.
--
-- That leaves the rows written before the label changed. At the time of writing
-- this database holds exactly ONE item with dimensions — the demo fridge, at
-- 50 x 60 x 205 — and those are plainly centimetres: a fridge 205 mm tall is
-- twenty centimetres. Scaling every populated row by ten is therefore both
-- complete and safe here, and it is preferred over guessing from magnitude,
-- because a heuristic in a migration is a bug waiting for its first exception.
update public.items
   set width_mm  = width_mm  * 10,
       depth_mm  = depth_mm  * 10,
       height_mm = height_mm * 10
 where width_mm  is not null
    or depth_mm  is not null
    or height_mm is not null;
