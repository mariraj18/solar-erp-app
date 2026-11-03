# Solar ERP - Mobile App (Expo)

This Expo app wraps the production Labour ERP with native GPS location permissions, Android physical back button navigation, and mobile camera access.

---

## 🚀 How to Run in Expo Go (Under 3 Minutes)

### 1. Requirements
- Node.js (version 18 or newer)
- **Expo Go** app installed on your phone:
  - [Expo Go on Google Play Store (Android)](https://play.google.com/store/apps/details?id=host.exp.exponent)
  - [Expo Go on Apple App Store (iOS)](https://apps.apple.com/app/expo-go/id982107779)

### 2. Install Dependencies
Open your terminal inside this `expo-mobile` folder:
```bash
cd expo-mobile
npm install
```

### 3. Start the Expo Server
```bash
npx expo start
```

### 4. Connect Your Phone
- A QR code will display in your terminal.
- **Android**: Open the **Expo Go** app and tap **"Scan QR code"**.
- **iPhone**: Open the default **Camera** app, point at the QR code, and tap the prompt to open in Expo Go.

---

## 📦 How to Build an Installable Android APK

If you want a standalone `.apk` file to install on company mobile phones without needing Expo Go:

1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```

2. Log in or create a free Expo account:
   ```bash
   eas login
   ```

3. Configure EAS build:
   ```bash
   eas build:configure
   ```

4. Build the standalone APK:
   ```bash
   eas build -p android --profile preview
   ```
   Expo Cloud will compile and give you a direct download link for the `.apk` file!
