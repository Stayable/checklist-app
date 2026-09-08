-- On-site vs remote personnel (2026-09-09 ET, derived — the harness clock runs
-- ahead on this machine).
--
-- The batch-create wizard's "Assign to" list must be limited to people who
-- actually work at the property (Kyle, 2026-09-09). The schema could not
-- express that: MANAGER covers both the 8 on-site Property Managers and the 3
-- Remote Property Managers (Erika, Ruby, Jeffrey), and nothing distinguished
-- them. The same gap turned up the day before, when giving RPMs the template
-- Edit button necessarily gave it to all 11 managers.
--
-- "Holds more than one property" was considered as a derivation and rejected:
-- it is true today (RPMs hold 8/3/2, on-site PMs hold 1 each) and would break
-- silently the first time an on-site PM covers a second property — the kind of
-- bug that shows up as a person quietly vanishing from a pick-list.
--
-- Defaults FALSE, i.e. on-site. A wrong default should mean "listed where they
-- need not be", never "a real employee cannot be assigned work". Field staff
-- (HK/PA/MT) are on-site by role and never consult this column; it exists to
-- disambiguate MANAGER.
--
-- The 3 RPM rows are flipped to true by scripts/set-remote-managers.ts, not by
-- this migration: naming individual people in DDL is how a migration stops
-- being replayable on a fresh database.

ALTER TABLE "users"
  ADD COLUMN "remote" BOOLEAN NOT NULL DEFAULT false;
