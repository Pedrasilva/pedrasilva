-- Matching UX regression (read-only, rolled back): PSA · MBCP · 30/09 "MDB8022 APPLE.COM/BI 23.49EUR" -23,49.
-- Expect: the Apple Distribution International 23,49 Entrada document ranks first in suggestions,
-- the candidate pool starts with an exact-amount row, has no repeated Entrada copies, and suggestions answer in < 5 s.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"ab5a48c0-939b-4502-bd3b-db7801f0f8b8","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE _t ON COMMIT DROP AS SELECT clock_timestamp() AS t0;
CREATE TEMP TABLE _s ON COMMIT DROP AS SELECT row_number() OVER () AS rn, * FROM public.fin_reconcile_suggestions('2707449d-5841-4382-93c1-da22df8f88d0');
CREATE TEMP TABLE _secs ON COMMIT DROP AS SELECT extract(epoch FROM clock_timestamp() - t0) AS secs FROM _t;
CREATE TEMP TABLE _c ON COMMIT DROP AS SELECT row_number() OVER () AS rn, * FROM public.fin_reconcile_candidates('2707449d-5841-4382-93c1-da22df8f88d0', NULL);
SELECT 'apple_first' AS check_name, (SELECT counterparty ILIKE 'Apple Distribution%' AND amount = 23.49 FROM _s WHERE rn = 1) AS ok
UNION ALL SELECT 'fast_under_5s', (SELECT secs < 5 FROM _secs)
UNION ALL SELECT 'pool_exact_first', (SELECT abs(COALESCE(outstanding, amount)) = 23.49 FROM _c WHERE rn = 1)
UNION ALL SELECT 'pool_no_repeated_entrada', (SELECT count(*) = count(DISTINCT (lower(COALESCE(counterparty,'')), label, amount)) FROM _c WHERE kind = 'entrada')
UNION ALL SELECT 'pool_same_direction', NOT EXISTS (SELECT 1 FROM _c WHERE kind = 'sale');
ROLLBACK;
