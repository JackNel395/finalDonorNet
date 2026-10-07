-- Restore script for the two `profiles` columns dropped on 2026-10-07.
--
-- Companion to recovered-center-ops-schema.ts. Run this ONLY if you revive the
-- center-operations feature and want the exact pre-drop state back. It is
-- idempotent and safe to re-run.
--
-- Why this exists instead of a snapshot: the project's plan allows one snapshot,
-- and that slot holds `before-drift-column-drop` (snap-plain-art-azwljwp9),
-- which is the only copy of the five columns dropped earlier the same day.
-- These two columns held 21 rows between them, so an exact script is a better
-- and more targeted recovery artifact than a whole-database rollback.
--
-- Pre-drop state, captured 2026-10-07:
--   profiles.role            — all 21 rows 'member'; nobody held 'admin'
--   profiles.staff_center_id — 4 of 21 set, one demo operator per center

-- 1. Recreate the enum type (dropped alongside the column once orphaned).
DO $$ BEGIN
  CREATE TYPE "user_role" AS ENUM ('member', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Recreate the columns, with the original defaults and FK behavior.
ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "role" "user_role" NOT NULL DEFAULT 'member';

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "staff_center_id" text;

DO $$ BEGIN
  ALTER TABLE "profiles"
    ADD CONSTRAINT "profiles_staff_center_id_donation_centers_id_fk"
    FOREIGN KEY ("staff_center_id") REFERENCES "public"."donation_centers"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Restore the four staff assignments. Every other row was 'member' with a
--    NULL staff_center_id, which the column defaults above already reproduce.
--    These are the seeded demo operator accounts, one per donation center.
UPDATE profiles SET staff_center_id = 'ctr-1'
  WHERE user_id = 'XkXvUepkThDGyrMZhGRhVQv0qWBsrL0I';  -- operator.redcross  → Philippine Red Cross – Cebu Chapter
UPDATE profiles SET staff_center_id = 'ctr-2'
  WHERE user_id = 'ePdBLi9gqZD8SMuglz2SjUdAiuY0sl71';  -- operator.vsmmc     → Vicente Sotto Memorial Medical Center
UPDATE profiles SET staff_center_id = 'ctr-4'
  WHERE user_id = 'BZD2COdA6r9NZarCP4D3hTBypLzye1Rt';  -- operator.ucmed     → University of Cebu Medical Center
UPDATE profiles SET staff_center_id = 'ctr-5'
  WHERE user_id = 'ifGlWBjWvhFcNmBIW58Tq3dF40Cuivpq';  -- operator.mactan    → Mactan Doctors' Hospital

-- Verify: expect 21 'member' rows and 4 with a center.
-- SELECT role, count(*), count(staff_center_id) FROM profiles GROUP BY role;
