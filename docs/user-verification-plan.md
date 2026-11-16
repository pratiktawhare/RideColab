# User Verification & Identity Architecture Plan (Future Phase)

> **Status**: Planned / Reference Only (Do Not Execute Yet)  
> **Benchmark**: BlaBlaCar, Quick Ride, sRide  
> **Target Audience**: Students & Daily Commuters in Pune, India  
> **Compliance**: India Digital Personal Data Protection (DPDP) Act 2023, Motor Vehicle Aggregator Guidelines  

---

## 1. Executive Summary & Problem Statement

In RideColab's current authentication flow:
- Registration only collects `name`, `email`, `password`, `gender`, and `mode`.
- Mobile phone numbers are not collected.
- Emails and mobile numbers are unverified.

### Why This Is a Critical Challenge in Real-World Carpooling:
1. **Safety & Real-World Accountability**: Peer-to-peer transport involves two strangers sharing a private car or two-wheeler. Anonymous or disposable accounts present a severe safety risk in case of harassment, theft, or accidents.
2. **Driver-Passenger Coordination**: Riders and passengers cannot coordinate roadside pickups ("I am waiting near the flyover bus stop") without a verified phone line.
3. **SOS & Emergency Response**: In the event of an SOS trigger, emergency services and registered emergency contacts require a verified, authentic mobile number.
4. **Preventing Spam & Seat Blocking**: Unverified email accounts allow bad actors to create burner profiles to maliciously reserve and block all seats on a rider's trip.

---

## 2. Industry Benchmark: How Leading Platforms Handle Verification

### A. BlaBlaCar (Inter-City Standard)
BlaBlaCar enforces a multi-tier identity verification ladder:
1. **Mobile Number Verification (Mandatory on Signup)**:
   - User inputs mobile number with country code (+91 for India).
   - A 6-digit SMS OTP is verified before ride publishing or seat booking is allowed.
2. **Email Address Verification**:
   - Confirmation link or OTP sent to verify the email address for booking receipts, emergency alerts, and password recovery.
3. **Government ID Verification (Trust Badge)**:
   - Users upload a government-issued photo ID (Aadhaar, Driving License, or Passport).
   - Automated OCR extracts name and photo; a liveness selfie check matches the user's face.
   - Profile receives a **"Verified ID"** badge, increasing booking acceptance by 80%+.

### B. Quick Ride & sRide (India Daily Commute & Campus Standard)
In urban India, the gold standard for daily carpooling trust is **Institutional & Corporate Email Verification**:
1. **Mobile OTP (Primary Identity Anchor)**:
   - SIM cards in India are tied to government KYC; a verified phone number anchors the user to a legitimate identity.
2. **College / Corporate Domain Verification**:
   - Commuters enter their official institutional email (e.g., `student@zeal.edu.in`, `rahul@coep.ac.in`, `priya@tcs.com`).
   - A 6-digit verification code is delivered to that institutional inbox.
   - Grants a **"Verified Student — Zeal College"** or **"Verified Corporate — Infosys"** badge.
   - Users can filter searches to travel exclusively with verified students or colleagues.
3. **Driving License (DL) & RC Declaration**:
   - Vehicle owners declare or upload their DL and vehicle registration details before publishing rides.

---

## 3. Privacy & Data Storage (DPDP Act 2023 Principles)

Under India's **Digital Personal Data Protection Act 2023**, RideColab must follow strict data minimization and purpose limitation:

### A. What Personal Data To Store
- **Full Legal Name**: Stored in DB; only first name and initial shown publicly.
- **Mobile Number**: Stored in DB; strictly masked until a ride booking is confirmed.
- **Personal Email**: Kept completely private from other users.
- **College / Work Email**: Kept private; only the institution name (e.g., "Zeal College") is displayed as a public badge.
- **Gender**: Stored to support Women-Only trip filtering.
- **Emergency Contacts**: Up to 3 contacts (name, relationship, phone) for SOS dispatch.

### B. Privacy Matrix

| Data Field | Search Cards / Public | Confirmed Co-Travelers | System Admin Only |
|---|---|---|---|
| **First Name + Initial** | Visible | Visible | Visible |
| **Trust Score & Badges** | Visible ("Phone ✓", "Zeal College ✓") | Visible | Visible |
| **Phone Number** | ❌ **Hidden** | ✅ **Revealed only AFTER booking is accepted** | Visible |
| **Email Address** | ❌ **Hidden** | ❌ **Hidden** | Visible |
| **Emergency Contacts** | ❌ **Hidden** | ❌ **Hidden** | Triggered only on SOS |
| **Live Location GPS** | ❌ **Hidden** | ✅ **Visible during active ride only** | 🗑️ Auto-deleted after trip |

---

## 4. Free-Tier Implementation Strategy for RideColab

Commercial Indian SMS gateways (Twilio, Gupshup, Fast2SMS) require DLT enterprise registration with TRAI and per-SMS fees. RideColab can achieve production-grade verification with zero infrastructure cost:

### 1. Mobile Phone Verification via Firebase Phone Auth
- **Service**: Google Firebase Authentication (Phone Auth).
- **Free Quota**: **10,000 SMS OTPs per month** completely free.
- **Workflow**:
  1. User enters 10-digit Indian mobile number (`+91 98765 43210`).
  2. Firebase delivers an SMS OTP and verifies it on the client device.
  3. RideColab server receives the verified Firebase token and marks `is_phone_verified = true`.
  4. *Development/Testing Mode*: Configured with fixed test numbers (e.g., `+91 99999 99999` with OTP `123456`) to consume zero quota during automated or local testing.

### 2. Email OTP Verification
- **Service**: Nodemailer with Gmail SMTP / Resend free tier (100–300 free emails/day).
- **Workflow**:
  1. On registration, a 6-digit random OTP is hashed and stored in `otp_verifications` with a 10-minute expiry.
  2. User inputs the OTP in the app before accessing the full platform.

### 3. College / Campus Verification Badge
- Target: Pune educational institutions (Zeal Education Society, COEP, MIT-WPU, Pune University).
- **Workflow**:
  1. User navigates to Profile $\rightarrow$ "Verify College".
  2. Enters their `@*.edu.in` or `@*.ac.in` college email.
  3. Receives a verification code in their college inbox.
  4. On verification, profile earns the **"🎓 Verified Student — [College Name]"** trust badge.

---

## 5. Proposed Database Schema (For Future Migration)

```sql
-- 1. Extend users table with verification state
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone VARCHAR(15) UNIQUE,
ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS college_email TEXT,
ADD COLUMN IF NOT EXISTS is_college_verified BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS college_name TEXT;

-- 2. OTP Verification table for email & institutional verification
CREATE TABLE IF NOT EXISTS otp_verifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier  TEXT        NOT NULL, -- phone number or email address
  otp_hash    TEXT        NOT NULL,
  type        VARCHAR(20) NOT NULL, -- 'phone', 'email', 'college_email'
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_identifier_type ON otp_verifications(identifier, type);
```

---

## 6. Rollout Phasing (When Ready To Execute)

1. **Step 1 — Database Migration**:
   - Add verification columns to `users` table and create `otp_verifications` table.
2. **Step 2 — Backend Auth Endpoints**:
   - `POST /api/v1/auth/phone/send-otp` & `POST /api/v1/auth/phone/verify-otp`.
   - `POST /api/v1/auth/email/send-otp` & `POST /api/v1/auth/email/verify-otp`.
   - `POST /api/v1/users/verify-college`.
3. **Step 3 — Client Auth & Profile UI**:
   - Update `register.tsx` to include phone number input and OTP verification step.
   - Add verification checklist cards in `user-profile.tsx` showing badges for Phone, Email, and College.
   - Update driver & passenger cards to display trust badges.
4. **Step 4 — Co-Traveler Phone Masking**:
   - Expose rider/passenger phone numbers only inside `booking-detail.tsx` and `live-ride.tsx` once a booking reaches `accepted` or `started` status.
