# Android (Google Play) Requirements

---

## Google Play Developer Account
Register at Google Play Console with a one-time **$25 fee**. Accept the Google Play Developer Distribution Agreement. Organization accounts require a D-U-N-S Number.

---

## Store Listing Requirements

| Field | Limit |
|---|---|
| App Name | 30 characters max |
| Short Description | 80 characters max |
| Full Description | 4,000 characters max |
| App Icon | 512×512 PNG |
| Feature Graphic | 1024×500 PNG (required) |
| Phone Screenshots | 2 minimum, 8 maximum |
| Privacy Policy URL | Required |

Tablet screenshots (7" and 10") optional but recommended if layout is tablet-optimized.

---

## Privacy & Legal Requirements
- **Privacy Policy URL** required for all apps
- **Data Safety section** (mandatory) — declare all data collected, shared, encrypted in transit/at rest, and whether users can request deletion:
  - Account info (email, display name)
  - App activity (campaign data, session events)
  - Device or other IDs
- **Content rating** — IARC questionnaire; TTRPG fantasy violence + UGC = expected **Teen / PEGI 12**
- **Families Policy** — does not apply; Vaultstone is not directed at children under 13
- **User-generated content (homebrew)** — must include in-app reporting mechanism and published content policy

---

## Build Configuration

### `app.config.ts` Required Fields
```typescript
android: {
  package: 'com.vaultstone.app',   // unique on Play Store; cannot change after publish
  versionCode: 1,                   // integer; must increment on every submission
  permissions: [
    'INTERNET',
    // Add only permissions the app actually uses:
    // 'READ_MEDIA_IMAGES',          // if accessing photos for avatars
    // 'READ_EXTERNAL_STORAGE',      // Android <13 only, for local PDF access
    // 'POST_NOTIFICATIONS',         // Android 13+ push notifications
  ],
}
```

### EAS Secrets (set per environment)
```
SUPABASE_URL
SUPABASE_ANON_KEY
GOOGLE_SERVICE_ACCOUNT_KEY_JSON   (contents of service account .json file)
```

### Requirements
- Target API: **API 35 (Android 15)** — Google enforces recency for new apps. Expo SDK 52+ targets this by default.
- Minimum Android: **6.0 (API 23)**; recommend 7.0 (API 24)+
- Play Store requires **AAB (.aab)** format — not APK — for new apps. EAS Build produces AAB by default.
- All native libraries must include 64-bit (arm64-v8a) variant — satisfied automatically by Expo managed workflow
- EAS can auto-manage the Android Keystore

---

## App Signing
Enroll in **Google Play App Signing** (required for all new apps since August 2021):
- Google holds the final signing key; EAS manages the **upload key**
- Store EAS-generated keystore credentials securely — loss of upload key can be recovered via Google only if Play App Signing is enrolled

---

## Submission Process
1. Increment `android.versionCode` in `app.config.ts`
2. `eas build --platform android --profile production`
3. `eas submit --platform android`
4. In Play Console: complete store listing, content rating questionnaire, and Data Safety form
5. Submit to **Internal Testing** track first → Closed Testing → Open Testing → **Production**
6. Production releases can use staged rollout (10% → 50% → 100%)

Typical review time for new apps: **several hours to a few days**. Updates are usually faster.

---

## OTA Updates (Expo Updates)
JS-layer changes can be pushed via **EAS Update** without Play Store resubmission.

A new AAB submission is required when:
- New native modules or Android permissions are added
- `android.package` or native configuration changes
- `versionCode` must be incremented for each new submission regardless

---

## Key Review Guideline Notes
- **Permissions policy:** Only declare permissions the app actively uses; unrequested permissions trigger rejection
- **Sensitive permissions** (e.g., `READ_EXTERNAL_STORAGE` for local PDF indexing): may require Data Safety declaration and possibly a Permission Declaration Form
- **User-generated content:** Reporting mechanism required for UGC apps
- **In-app purchases:** Google Play Billing must be used for digital goods — no external payment links for in-app content
