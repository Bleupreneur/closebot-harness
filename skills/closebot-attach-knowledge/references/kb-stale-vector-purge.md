> **cb equivalents:** find deflecting content with `cb kb verify --source <src> --json` + `cb library get-view --fileId <fileId>`
> (the file's text; `cb library get-files --fileId <id>` returns its metadata). The full-purge remedy is
> `cb library delete-files --fileId <old> --confirm` (Tier 2) → `cb kb build --source <src> --from <dir>` (uploads + attaches) →
> `cb smartfaq delete-smart-faq --id <faqId> --confirm` + `cb smartfaq post-smart-faq`. Test phrasings with
> `cb bot test <botId> "..."` on a bot that has a persona. Run `cb help library` / `cb help smartfaq` for exact flags.

# Insurance-deflection fix — case study (2026-08-28)

> Session that proved: KB deflections are truth gaps, PUT-replace leaves stale
> vectors, and warning lines get retrieved as answers. Read this before
> "fixing a bot that says 'not sure'" or when retrieval is non-deterministic
> after a KB content fix.

## The incident

A wellness-clinic client's bot replied "not sure" to an insurance question,
turning a hot lead hostile (2026-08-27/28).

Timeline: bot deflected twice ("team will confirm coverage") → the lead: *"I
get a tap dance... I am no longer interested"* → the owner replied manually with
the canonical answer (no insurance; FSA/HSA yes, receipt fallback; special
financing ~30-sec approval). The canonical truth existed — it was never in the KB.

## Root cause chain

1. Library file `03-memberships-and-pricing.txt` (build-time scrape) contained:
   `Insurance: NOT CONFIRMED. Defer to the team.` and
   `Financing provider: NOT CONFIRMED... Do NOT promise financing... Defer.`
2. Smart FAQ "Do you take insurance?" was built FROM that line → same deflection.
3. Bot flow (v0.0.12) had ZERO insurance/financing mentions → no
   MultiObjective-override; the KB was the sole cause.
4. Bot did exactly what it was taught. Not a bug — a truth gap.

**Lesson:** "not 100% sure / the team will confirm" on a BUSINESS fact
(insurance, hours, fees, payment) = KB says "NOT CONFIRMED. Defer". Grep the
library files for `NOT CONFIRMED|Defer|TBD` first; that IS the diagnosis.

## The fix (order matters)

1. **Both layers, never one alone:** library file AND Smart FAQs. FAQ built
   from a deferring file re-learns the deflection at re-index.
2. Replace the deferral block with the owner's canonical words + an explicit
   instruction: "Say this plainly and immediately — never defer or dodge it."
3. Smart FAQs have NO PUT (405). Update = DELETE + POST, verify via GET
   (204s prove nothing; there is no dedup on POST).
4. Content guidance: financing answers
   should state facts with authority ("Yes, through <financing provider>"), and
   NEVER contain booking language — booking prompts inside pricing/financing
   docs cause "context poisoning" (bot verbally promises appointments without
   booking them).

## The stale-vector disease (the hard-won part)

After the content fix, verification was **non-deterministic**: same question
answered correctly on one turn, deflected the next; a control question
(a different service, untouched) quoted $120, then $200 — while every FAQ/file said $100.

What the logs showed: `Tool iteration count: 0` on some turns (model skipped
retrieval entirely); retrieved chunks sometimes contained the OLD
"NOT CONFIRMED" text even though `/view` returned the NEW content and
`fileStatus` = `indexed`.

- Failed remedies: waiting past the re-index window; a second (no-op) PUT;
  delete+recreate of FAQs alone.
- **Working remedy — full purge:** `DELETE /library/files/{oldId}` → fresh
  `POST /library/files` (new fileId = clean embedding space) → re-attach to
  the source → delete+recreate the affected FAQs. Verify with the REAL
  phrasings (blunt AND casual), several turns each.

## The $200 hallucination mechanism

The pricing file contained a WARNING line: "website shows a '$200' figure
without mapping it to a tier... do NOT assume $200 covers every tier."
Retrieval served that fragment AS the control service's price. Rule: never leave
warning-style price mentions in KB files — rewrite as "<specific tier> price shown
as $200 on the site" so the number can't cross-match to other services.

## Verification matrix (minimum bar before declaring fixed)

- The lead's actual phrasing from the incident (blunt, e.g. "before I go further,
  is any of this covered by insurance?")
- Casual variant: "Do you take insurance?"
- Adjacent intents: "Do you offer financing?" / "Do you accept HSA or FSA?"
- UNTOUCHED controls (catch collateral damage + pre-existing drift):
  pricing questions whose answers you know from the FAQs.
- Pass criteria: no "not 100% sure", no "team will confirm", correct named
  facts (e.g. the financing provider's name) present.

Final state: blunt phrasing PASS (the one the incident was about), casual
phrasings remained flaky → expected residual after rapid churn; the remaining
flakiness + the $100-vs-$200 conflict were handed to the owner for truth
confirmation (never resolve pricing conflicts by guessing).

## Related

- Deflection taxonomy for audit sweeps: 73 FAQs → 54 direct / 19 deflecting;
  of the 19, only ~6 were truth gaps (hours, travel fee/radius, and
  pricing for a few specific services and memberships) — ~10 were acceptable
  partial-answer defers, 3 were correct clinical/safety deferrals
  (pregnancy, med interactions, cure claims) that must stay deferrals.
- Deflection regex used for the sweep:
  `not 100% sure|don't have|not confirmed|team will|the team|defer|don't want to|rather the team|can't speak|team can walk|they'll cover|team confirms|sort out`
