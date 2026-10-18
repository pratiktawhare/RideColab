# EAS Dev Build — RideColab

> **Why you need this**: `@maplibre/maplibre-react-native` (and `@gorhom/bottom-sheet`) contain native code that cannot run inside Expo Go. You need a custom development build for full app functionality including maps and the animated bottom sheet.

---

## Prerequisites

1. **Expo account** — sign up at https://expo.dev (free)
2. **EAS CLI** installed:
   ```bash
   npm install -g eas-cli
   eas login
   ```
3. **Android device or emulator** (Android 10+)

---

## One-time Setup (already done if `eas.json` exists)

```bash
cd client
eas init          # Links this project to your Expo account (creates project ID)
```

Check `eas.json` — the `development` profile should exist:
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    }
  }
}
```

---

## Build the Dev Client APK

```bash
cd client
eas build --profile development --platform android
```

- **Build time**: ~10–15 min on EAS cloud. You have **30 free build-minutes/month** on the free tier — use them sparingly.
- When complete, EAS prints a QR code and a download link for the `.apk`.

### Install on device

1. Download the `.apk` from the EAS dashboard link.
2. Transfer to your Android device (USB or direct download on device).
3. Enable **"Install unknown apps"** in Android settings for your browser/Files app.
4. Install the `.apk`.

---

## Running the Dev Build

After installing, start the Metro bundler:

```bash
cd client
npx expo start --dev-client
```

Open the installed **RideColab (Dev)** app on your device and scan the QR code, or it may auto-connect on the same Wi-Fi.

> **Using mobile hotspot?** Use `npx expo start --dev-client --lan` and make sure your PC and phone are on the same network. If they're not, use `--tunnel` (requires `@expo/ngrok`).

---

## What Works in Expo Go vs Dev Build

| Feature | Expo Go | Dev Build |
|---|---|---|
| Login / Register / Auth | ✅ | ✅ |
| Home screen UI | ✅ | ✅ |
| Dark mode, i18n | ✅ | ✅ |
| SkeletonLoader, ColdStartScreen | ✅ | ✅ |
| RiderPassengerToggle (animated) | ✅ | ✅ |
| Bottom sheet (gorhom) | ⚠️ Limited | ✅ Full |
| MapLibre map | ❌ | ✅ |
| Haptics | ✅ (most devices) | ✅ |
| Expo Push Notifications | ❌ | ✅ |

---

## Free Tier Limits

| Limit | Details |
|---|---|
| Build minutes | 30 min/month — a dev build uses ~10–12 min |
| Concurrent builds | 1 |
| Updates (EAS Update) | 1,000 monthly active users |

> **Tip**: Do NOT rebuild for every feature. Use `npx expo start --dev-client` with Metro for hot reload. Only rebuild when native dependencies change (e.g., adding a new package with native code in Phase 5 when MapLibre is added).

---

## Troubleshooting

**`eas build` fails with "Project not found"**
→ Run `eas init` first.

**APK installs but shows blank screen**
→ Make sure Metro is running (`npx expo start --dev-client`) before opening the app.

**Map doesn't show tiles**
→ Check `EXPO_PUBLIC_MAP_TILE_URL` in `client/.env`. Default is `https://tiles.openfreemap.org/styles/liberty` (free, no API key).

**Google OAuth not working in dev build**
→ Add your dev build's `android:package` to the Google Cloud Console OAuth redirect URIs.

---

*Last updated: Phase 4 — Mobile App Shell and Design System*
