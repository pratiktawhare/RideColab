# RideColab — Legal Note

> ⚠️ **IMPORTANT**: This document is for reference only. It does NOT constitute legal advice.
> RideColab is a student project. Verify all information against officially notified rules before any real-world launch.

---

## Maharashtra Motor Vehicle Aggregator Rules 2026

The Government of Maharashtra notified the Motor Vehicle Aggregator Rules, 2026 on 15 July 2026,
recognising private carpooling for cost-sharing without profit.

Key provisions relevant to RideColab (to be verified against the notified rules):
- Private vehicle pooling for cost-sharing (not profit) appears to be recognised.
- Reported limit of **14 pooling trips per week** per driver — implemented as configurable `WEEKLY_TRIP_LIMIT` in `app_config`.
- Insurance coverage for driver and passenger recommended.
- Women-only pooling options mentioned.

**RideColab implements the following guardrails** (marked "verify against notified rules"):
- [ ] Configurable weekly trip counter per rider (default 14) — blocks posting beyond limit.
- [ ] Fare cap strictly enforced server-side.
- [ ] Insurance and licence self-declaration checkbox before posting.
- [ ] Women-only filter option.
- [ ] Consent screens and visible disclaimer.
- [ ] Disclaimer: "Cost-sharing only. Not a taxi service. No commission."

---

## India Digital Personal Data Protection (DPDP) Act 2023

RideColab is designed with DPDP Act 2023 in mind:
- Minimum necessary data collected.
- Explicit consent obtained at sign-up (and re-obtained if consent text changes).
- Live location stored only during an active trip; deleted afterwards.
- Users can request account deletion at any time (`DELETE /api/v1/users/me`).
- Data processing purposes disclosed in the in-app Privacy Policy.

---

## Disclaimer (shown in-app)

> "RideColab facilitates cost-sharing between private vehicle owners and passengers traveling
> along the same route. This platform takes no commission and never profits from rides.
> Riders may only charge up to the actual calculated cost of fuel for the trip.
> RideColab is a student project and is not a licensed taxi or cab aggregator service.
> Users are solely responsible for complying with all applicable laws and regulations.
> Verify compliance with the Maharashtra Motor Vehicle Aggregator Rules 2026 and any other
> applicable rules before using this platform for real trips."

---

*Last updated: 2026-10-15. To be reviewed and completed in Phase 14.*
