# Offline Check-in App (React Native)

**Fast, offline-first QR check-in for workshops.**

📱 **Works offline** → 📥 Sync registrations → 📷 Scan QR → 📤 Auto-sync when online

---

## 🚀 Quick Start

```bash
cd checkin_app
npm install
npm run start
```

**For Android Emulator:**
```bash
# Update .env with:
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4000
npm run android
```

---

## ⚙️ Configuration

Create `.env`:
```
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000
EXPO_PUBLIC_SYNC_PULL_ENDPOINT=/api/sync-data
EXPO_PUBLIC_SYNC_PUSH_ENDPOINT=/api/registrations/sync
```

---

## 📖 User Guide

### **4 Steps to Check In Students:**

1. **Setup** → Enter workshop ID, tap "📥 Sync Data"
2. **Status** → See Total / Checked-in / Pending counts
3. **Scan** → Point camera at student QR code
4. **Sync** → Auto-pushes when online

**✅ Feedback** (instant < 1s):
- ✅ Green flash + double vibrate = Success
- ⚠️ Yellow flash + long vibrate = Already checked in
- ❌ Red flash + triple vibrate = Not found

---

## 🔧 Features

- ✅ **Offline-first**: SQLite local database
- ✅ **Workshop-scoped**: Manage multiple workshops
- ✅ **Auto-sync**: Pending check-ins push when online
- ✅ **QR validation**: < 1s offline check
- ✅ **Image evidence**: Optional photo attachment
- ✅ **Retry backoff**: 15min → 30min → 60min
- ✅ **Vibration feedback**: Accessibility patterns

---

## 📚 Documentation

- **[README_DETAILED.md](README_DETAILED.md)** ← Full user & developer guide
- **[UI_FLOW.md](UI_FLOW.md)** ← Visual step-by-step + state machine

---

## 🗄️ Database

**SQLite Table**: `local_registrations`

```
registration_id (TEXT, PRIMARY KEY)
qr_code_hash (TEXT, UNIQUE)
workshop_id (TEXT)
full_name (TEXT)
checkin_status (INTEGER: 0 or 1)
checkin_time (TEXT: ISO 8601)
sync_status (TEXT: 'SYNCED' or 'PENDING')
```

---

## 🌐 API Endpoints

### Pull Sync
```
GET /api/sync-data?workshop_id=WS001
```
Downloads registrations for a workshop → stored in SQLite

### Push Sync
```
PUT /api/registrations/sync
```
Uploads pending check-ins → marks as SYNCED on success

---

## 📦 Tech Stack

- **React Native** (Expo SDK 51)
- **SQLite** (expo-sqlite/legacy)
- **QR Scanner** (expo-barcode-scanner)
- **Network** (@react-native-community/netinfo)
- **Image Picker** (expo-image-picker)
- **Background Sync** (expo-background-fetch + expo-task-manager)

---

## 🐛 Troubleshooting

| Issue | Fix |
|-------|-----|
| Camera permission denied | Grant in Settings → Permissions → Camera |
| QR not scanning | Ensure good lighting; try different distance |
| "Network: Offline" when online | Restart app; check WiFi/mobile data |
| Background sync not working | Use Android Emulator (Expo Go doesn't support background tasks) |
| Sync fails repeatedly | Check backend API is running; ensure endpoints match .env |

---

## 🚀 Production Build

```bash
eas build --platform android
```

See [Expo EAS Docs](https://docs.expo.dev/build/introduction/) for details.

---

**For complete documentation, see [README_DETAILED.md](README_DETAILED.md)**
- The OS decides the exact schedule; minimum interval is best-effort (15 minutes).
- For reliable background fetch testing, use a dev build or production build (Expo Go has limitations).
- If the device/OS does not support background fetch, the app falls back to manual/online sync.

## Workshop-specific Data

- The app stores `workshop_id` and `full_name` for each registration.
- Scanning only validates QR codes for the currently selected workshop.

## Image Attachment (Optional)

Use the "Choose Image" button to attach a photo from the device library. This is stored locally (no upload yet).

## Verify config

```bash
npm run verify
```

## Notes
- The app reads `EXPO_PUBLIC_*` env variables at build time.
- The sync endpoints must exist on the backend.
- If you deploy the API, update `EXPO_PUBLIC_API_BASE_URL` accordingly.
