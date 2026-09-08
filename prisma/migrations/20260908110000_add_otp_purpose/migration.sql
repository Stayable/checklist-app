-- Self-service password reset via email OTP (2026-09-08 ET, derived — the
-- harness clock runs ahead on this machine).
--
-- Why this exists: Erika could not sign in on 2026-09-08 and reported it as a
-- lockout. She was not locked (2 failed attempts, `locked_until` null). Her
-- password had been overwritten by an admin on 09-07 at 4:11 PM ET, four days
-- after she chose her own on 09-03, so she was typing a credential that no
-- longer existed. Nothing in the product could tell her that, and nothing let
-- her fix it herself — admin-initiated reset was the only route, which means
-- access depends on Kyle being awake.
--
-- The reset code rides the existing `login_otps` table rather than a new one:
-- the issue/verify/expire/attempt-count machinery is already proven by the
-- new-device login gate, and duplicating it would mean two places to get
-- constant-time comparison and peppering right.
--
-- But the two code types must NOT be interchangeable. A LOGIN code is only
-- ever issued to someone who already passed the password check. A
-- PASSWORD_RESET code is issued to anyone who can type an email address. If
-- one table served both without a discriminator, a code obtainable with an
-- address alone would satisfy the login OTP gate in `authorize()`. Hence the
-- column, and hence every verify query filtering on it.
--
-- Additive and defaulted, so it is safe to apply ahead of the deploy: existing
-- unconsumed rows were all issued by the login flow and become LOGIN, which is
-- what they already were.

CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'PASSWORD_RESET');

ALTER TABLE "login_otps"
  ADD COLUMN "purpose" "OtpPurpose" NOT NULL DEFAULT 'LOGIN';

-- Verification always looks up by (user, purpose, unconsumed, newest first).
CREATE INDEX "login_otps_user_id_purpose_idx" ON "login_otps"("user_id", "purpose");
