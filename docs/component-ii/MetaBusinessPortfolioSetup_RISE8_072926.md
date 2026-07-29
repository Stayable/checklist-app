# Meta Business Portfolio — Setup Steps

**For:** Kate
**Prepared:** 2026-07-29
**Purpose:** Stand up and verify a Meta Business Portfolio so Twilio can register a WhatsApp Business sender for contractor dispatch.
**Where this fits:** Phase 1, steps 1.3 and 1.6 of `WhatsAppAutomationSpec_RISE8_072826.md`. Kyle has already created the Twilio account and bought the number (1.1, 1.2). Everything downstream — templates, then the app integration — is blocked until this is verified.

---

## Two decisions to make before you touch anything

These two answers shape the whole submission, and getting them wrong means a rejected review and a resubmit.

**D1 — Which legal entity gets verified?**
Meta verifies a **legal business**, matched against a registration document. Options are RISE8 Companies or the Stayable entity (if Stayable is separately registered). Whichever you pick, the legal name, the address, and the domain you verify all have to belong to *that* entity and match its paperwork exactly.

**D2 — What display name will contractors see?**
This is the name shown on WhatsApp messages. Recommended: **Stayable** or **Stayable Maintenance** — contractors know that brand, not "RISE8".

⚠️ If D2's display name differs from D1's legal name, Meta may ask you to justify the connection. It's allowed — brands routinely differ from registered names — but it is a known cause of extra review. If Stayable is a registered DBA/trade name of RISE8, have that document ready; it resolves the question immediately.

## Have these ready before you start

- [ ] **Business registration / incorporation document** — the legal name on it is the name you must enter, character for character
- [ ] **Business address** exactly as it appears on that document
- [ ] **Business phone number**
- [ ] **A domain you control DNS for** — `rentstayable.com` or `rise8companies.com`. You'll need to add a DNS record, so pick the one whose DNS you can edit
- [ ] **A business email** on that domain (not a personal Gmail)
- [ ] **A personal Facebook account** — see the note below
- [ ] **An authenticator app** on your phone (2FA is required of admins)

> **The Facebook account requirement catches people out.** A Meta Business Portfolio must be administered by at least one personal Facebook login. There is no way to create one with only a business email. If you'd rather not attach your personal profile, create a separate Facebook account on your work email first and use that as the admin.

## Step 1 — Check whether a portfolio already exists

**Do this first.** Duplicate portfolios for the same business are a common cause of verification failure and are painful to merge.

1. Go to **business.facebook.com** and sign in.
2. If you land in an existing portfolio, check its name and business details. If RISE8 or Stayable already has one — possibly created for Instagram, Facebook Pages, or ads — **use it** rather than creating another.
3. Ask Kyle whether marketing has ever run Meta ads for Stayable. If yes, a portfolio almost certainly exists.

**If one exists:** skip to Step 3.

## Step 2 — Create the portfolio

1. business.facebook.com → **Create account** (label may read "Create a business portfolio").
2. **Business name:** the legal name from D1, matching the registration document exactly.
3. **Your name** and **business email** on the company domain.
4. Confirm the email when the verification message arrives.

## Step 3 — Fill in the business details completely

Find **Settings → Business info** (Meta moves this around; look for a gear icon, or "Business settings" inside Meta Business Suite).

Complete **every** field:
- Legal business name — exactly as on the document
- Address — exactly as on the document
- Phone number
- Website — the domain from D1
- Business type / structure

Incomplete or mismatched details here are the single most common reason verification bounces. It's worth being pedantic: "Suite 200" vs "Ste 200" has failed reviews.

## Step 4 — Add a second admin, and turn on 2FA

1. **Settings → People → Add** → add **Kyle** (`bke@rise8companies.com`) as **Admin**.
2. Turn on two-factor authentication for your own account.

Do not skip the second admin. A portfolio with one administrator is a single point of failure for the company's WhatsApp channel — if that account is locked out, recovery through Meta support is slow and unpleasant.

## Step 5 — Verify the domain

1. **Settings → Brand safety → Domains** (sometimes just "Domains").
2. Add the domain from D1.
3. Choose **DNS TXT record** verification and copy the TXT value.
4. Add that TXT record at the DNS host. `rentstayable.com` DNS is managed in **Vercel** — Kyle can add it, or ask him for access.
5. Wait for propagation (usually minutes) and click **Verify**.

## Step 6 — Submit Business Verification

1. **Settings → Business info → Start verification**, or via the **Security Centre**.
2. Upload the registration document.
3. Confirm the details match what you entered in Step 3.
4. Submit.

**What to expect:** sometimes automated and quick; sometimes a manual review taking **days to a couple of weeks**. I can't promise a timeline — Meta doesn't publish one and it varies by region and document quality. A rejection is not fatal; you can correct and resubmit.

## Step 7 — Send Kyle the handover

When verification shows **Verified**, send:
- [ ] The **Business Portfolio ID** (Settings → Business info)
- [ ] The verified **legal business name**
- [ ] The agreed **display name** from D2
- [ ] Confirmation that Kyle is an Admin
- [ ] Confirmation the domain shows verified

Kyle then runs Twilio's WhatsApp sender registration, which links to this portfolio and submits the display name for its own separate approval.

## Common rejection reasons

| Cause | Avoided by |
|---|---|
| Legal name doesn't match the document | Copy it character for character, including "LLC" / "Inc." |
| Address formatted differently to the document | Same — don't abbreviate what the document spells out |
| Domain not verified, or not owned by the entity | Step 5, using a domain that belongs to the D1 entity |
| Incomplete business info | Fill every field in Step 3 |
| Duplicate portfolios for one business | Step 1 |
| Document doesn't show the legal name **and** address together | Use the registration certificate; a utility bill or bank statement can work if both appear on it |

## What this does *not* cover

- **WhatsApp sender registration and display-name approval** — Twilio-side, Kyle's step 1.4/1.5. A *second, independent* Meta review.
- **Message templates** — Phase 2, after the sender is live.
- **App integration** — Phase 3, and nothing there can be tested until the sender exists.

## A caveat on the instructions themselves

Meta renames and relocates these screens frequently ("Business Manager" → "Business Portfolio", settings moving in and out of Meta Business Suite). The **sequence** is right, but a menu label may not match exactly. If a step's wording doesn't appear, search Meta's own help for the concept — "business verification", "domain verification", "add people to business portfolio" — rather than hunting for my exact phrasing. If something looks materially different from the above, tell Kyle before improvising.
