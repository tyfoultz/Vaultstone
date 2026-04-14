# iOS App Store Requirements

---

## Apple Developer Account
Enroll in the **Apple Developer Program** ($99/year). Organization accounts require a D-U-N-S Number.

---

## App Store Connect Setup
- Create **App ID** in Apple Developer Portal
  - Bundle ID must match `app.config.ts` (e.g., `com.vaultstone.app`)
  - Enable capabilities: Push Notifications (if used), Sign In with Apple
- Create app record in **App Store Connect**
  - App name, subtitle, primary category (Games or Reference)
  - SKU (internal identifier, never shown publicly)
  - Content rights declaration

---

## Store Listing Requirements

| Field | Limit |
|---|---|
| App Name | 30 characters max |
| Subtitle | 30 characters max |
| Description | 4,000 characters max |
| Keywords | 100 characters max |
| Promotional Text | 170 characters max (updatable without resubmission) |
| Support URL | Required — must be a live public webpage |
| Privacy Policy URL | Required |
| App Icon | 1024×1024 PNG, no alpha channel, no rounded corners |

**Screenshots (required per device size):**
- iPhone 6.9" (iPhone 16 Pro Max) — required
- iPhone 6.7" (iPhone 14/15 Plus) — required for older form factors
- iPad Pro 13" — required if app runs on iPad

---

## Privacy & Legal Requirements
- **Privacy Policy URL** required for all apps
- **App Privacy nutrition label** — declare all data types collected (account data, usage data, diagnostics)
- **Age rating** — TTRPG fantasy violence + user-generated content = expected **12+**
- **Sign In with Apple** — required if any third-party sign-in is offered (Google OAuth offered → Sign In with Apple must also be offered)
- **User-generated content (homebrew)** — must include in-app reporting mechanism and published moderation/content policy

---

## Build Configuration

### `app.config.ts` Required Fields
```typescript
ios: {
  bundleIdentifier: 'com.vaultstone.app',  // must match Apple Developer Portal
  buildNumber: '1',                         // integer string; increment on every submission
  infoPlist: {
    NSPhotoLibraryUsageDescription: 'Used to set your avatar image.',
    NSCameraUsageDescription: 'Used to capture a profile photo.',
    // Add only permissions the app actually requests
  },
}
```

### EAS Secrets (set per environment)
```
SUPABASE_URL
SUPABASE_ANON_KEY
APP_STORE_CONNECT_API_KEY_ID
APP_STORE_CONNECT_API_KEY_ISSUER_ID
APP_STORE_CONNECT_API_KEY_CONTENT   (base64-encoded .p8 file)
```

### Requirements
- Minimum OS: **iOS 16.0** (Expo SDK 52+)
- EAS Build produces `.ipa` for App Store submission
- `eas.json` must define a `production` profile targeting iOS
- EAS can auto-manage Apple Distribution Certificate and App Store Provisioning Profile
- App Store Connect API Key required for automated submission via `eas submit --platform ios`

---

## Submission Process
1. Increment `ios.buildNumber` in `app.config.ts`
2. `eas build --platform ios --profile production`
3. `eas submit --platform ios`
4. Complete metadata, screenshots, and privacy details in App Store Connect
5. Submit for review — typical: **1–3 business days**
6. Resolve any rejections and resubmit with a new build number

---

## OTA Updates (Expo Updates)
JS-layer changes can be pushed via **EAS Update** without App Store resubmission.

A new binary submission is required when:
- New native modules or permissions are added
- `app.config.ts` native configuration changes
- A new Expo SDK version with native changes is adopted

---

## Key Review Guideline Notes
- **Fantasy violence / TTRPG content:** Set age rating accurately — 12+ expected
- **User-generated content (homebrew):** Reporting mechanism and moderation policy are mandatory
- **In-app purchases:** If monetization added, must use Apple IAP — no external payment links
- **Sign In with Apple:** Must be offered alongside any third-party OAuth option
