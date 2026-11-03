# Solar ERP – Deployment & Production Architecture Guide

Comprehensive documentation for deploying the **Solar ERP** system, configuring URL-based portal routing for Admin/Staff and Labourers, deploying the Node.js backend with Supabase PostgreSQL, and building the standalone Android APK using Expo.

---

## 1. System Architecture

```
                               ┌────────────────────────────────────────────────────────┐
                               │           Supabase PostgreSQL Database                 │
                               │  postgresql://postgres:[PASSWORD]@db.owcydqnf...       │
                               └───────────────────────────▲────────────────────────────┘
                                                           │
                                                           │ TCP 5432
                                                           │
                               ┌───────────────────────────┴────────────────────────────┐
                               │             Shared Node.js Express Backend             │
                               │        (Render.com / Railway / Ubuntu VPS)             │
                               │  • REST API with Strict Role-Based Access Control      │
                               │  • 2Factor.in SMS Gateway for Real OTP Verification    │
                               │  • Expo Push Notification Dispatcher (FCM v1)          │
                               │  • Auto-seeds Default Master Admin only                │
                               └───────────▲────────────────────────────────▲───────────┘
                                           │                                │
                       HTTPS REST Requests │                                │ HTTPS REST Requests
                                           │                                │
                 ┌─────────────────────────┴──────────────┐                 │
                 │              Vercel Frontend           │                 │
                 │   (https://your-solar-erp.vercel.app)  │                 │
                 └─────────┬────────────────────┬─────────┘                 │
                           │                    │                           │
              URL: /admin  │                    │  URL: /labour             │
                           │                    │                           │
                           ▼                    ▼                           │
              ┌─────────────────────────┐  ┌─────────────────────────────┐  │
              │  Admin & Staff Portal   │  │    Site Worker Portal       │  │
              │  • Password Login Only  │  │  • Mobile OTP Login Only    │  │
              │  • Desktop Sidebar &    │  │  • GPS Geofence Clock-in    │  │
              │    Mobile Bottom Nav    │  │  • Random Spot Checks       │  │
              │  • Approvals & Ledgers  │  │  • Attendance History       │  │
              └─────────────────────────┘  └──────────────▲──────────────┘  │
                                                          │                 │
                                            Loads URL in  │                 │
                                            Native WebView│                 │
                                                          │                 │
                                           ┌──────────────┴───────────────┐ │
                                           │      Android Mobile APK      │─┘
                                           │ (Expo React Native / EAS)    │
                                           │ • Auto-loads /labour         │
                                           │ • Has 1-tap Admin Login      │
                                           │ • Background Push Alerts     │
                                           └──────────────────────────────┘
```

---

## 2. Authentication & URL Routing Details

Instead of maintaining two disconnected frontend projects, a single unified Vite application routes users cleanly based on the URL path:

| URL Path | Target Audience | Authentication Method | Post-Login Dashboard |
| :--- | :--- | :--- | :--- |
| **`/admin`** (or `/`) | Master Admin, Operations Managers, Site Staff | **Password Only** (Email or Mobile + Password) | Full Executive ERP Dashboard (Sidebar on Desktop, Emerald Pill Bottom Nav on Mobile) |
| **`/labour`** (or `/worker`) | Field Labourers & Trade Workers | **Mobile OTP Only** (10-digit Mobile + 2Factor SMS) | Dedicated Mobile-First Labour Portal (GPS Geofence Clock-in, Spot-checks, History) |

### How Admin Logs In on the Mobile APK
1. Field workers open the Android APK and directly see the **Site Worker OTP Login**.
2. Right below the OTP button, there is a dedicated switch button:  
   **`[ 👔 Admin & Staff Sign In (Password) ]`**
3. When tapped, the screen flips to the **Password Login**.
4. The Admin enters their credentials and is instantly redirected to the **Full Admin Mobile View** with the mobile bottom navigation bar (**Home**, **Attendance**, **GPS**, **Payments**, **More**).

---

## 3. Backend Deployment (Render.com / Railway / VPS)

> [!WARNING]
> **Do not deploy the Express backend to Vercel Serverless.**  
> Vercel Serverless Functions have an ephemeral, read-only file system, strict 10s-15s execution timeouts, and do not maintain persistent database connection pools or socket listeners.  
> Deploy the backend on **Render.com** (Web Service), **Railway.app**, or an **Ubuntu VPS**.

### Deploying to Render.com (Step-by-Step)
1. Push your repository to **GitHub**.
2. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** > **Web Service**.
3. Connect your GitHub repository.
4. Configure the service settings:
   - **Name**: `solar-erp-backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. In the **Environment Variables** tab, add:

```env
PORT=3000
NODE_ENV=production
APP_ENV=production
JWT_SECRET=your-super-secure-internal-secret-2026

# Supabase PostgreSQL Connection
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.owcydqnfzjjfootlhoux.supabase.co:5432/postgres
SUPABASE_DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.owcydqnfzjjfootlhoux.supabase.co:5432/postgres

# 2Factor SMS Gateway
TWOFACTOR_API_KEY=6b3149a1-d70f-11f1-ac3e-0200cd936042

# Initial Master Admin Credentials (Auto-created on first start)
DEFAULT_ADMIN_EMAIL=admin@company.erp
DEFAULT_ADMIN_PASSWORD=Admin@ERP2026!
```

6. Click **Deploy Web Service**. Once deployed, Render will provide a public URL like `https://solar-erp-backend.onrender.com`.

---

## 4. Frontend Deployment on Vercel

The root [vercel.json](file:///c:/candy/Solar%20erp/solar_erp%20(1)/vercel.json) has already been configured with SPA rewrite rules to ensure `/admin`, `/labour`, and all sub-routes load without 404 errors.

### Deploying to Vercel (Step-by-Step)
1. Go to [Vercel Dashboard](https://vercel.com/) and click **Add New...** > **Project**.
2. Import your GitHub repository.
3. Configure the Project:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. In **Environment Variables**, add:
   ```env
   VITE_API_URL=https://solar-erp-backend.onrender.com/api
   ```
   *(Replace with your actual Render / Railway backend URL).*
5. Click **Deploy**. Vercel will build and assign your domain (e.g. `https://solar-erp.vercel.app`).

### Verify Deployment Links
- **Admin Portal**: `https://solar-erp.vercel.app/admin`
- **Labour Portal**: `https://solar-erp.vercel.app/labour`

---

## 5. Android APK Build & Configuration (Expo EAS)

The Android APK is a native React Native WebView application that loads the Labour portal by default, provides native GPS geofence permissions, and registers for real Firebase Cloud Messaging (FCM) push notifications.

### Step 1: Update Production URL in `expo-mobile/App.js`
Open [expo-mobile/App.js](file:///c:/candy/Solar%20erp/solar_erp%20(1)/expo-mobile/App.js) and update line 67 to your production Vercel URL:

```javascript
// Default to Labour portal on production Vercel domain
const DEFAULT_URL = 'https://solar-erp.vercel.app/labour';
```

### Step 2: Ensure `google-services.json` is in Place
Verify that [expo-mobile/google-services.json](file:///c:/candy/Solar%20erp/solar_erp%20(1)/expo-mobile/google-services.json) exists with:
- Package: `com.solardesigns.labourerp`
- Project: `solarerp-65080`

### Step 3: Link Firebase Service Account in EAS
1. Open PowerShell and navigate to `expo-mobile`:
   ```powershell
   cd "C:\candy\Solar erp\solar_erp (1)\expo-mobile"
   ```
2. Log in to Expo:
   ```powershell
   eas login
   ```
3. Upload your Firebase Admin Service Account Key:
   ```powershell
   eas credentials
   ```
   - Choose: **Android** > **preview** > **Push Notifications: Manage your FCM credentials** > **Google Service Account Key** > Select your downloaded Firebase `.json` key file.

### Step 4: Build Standalone APK
Run the cloud build command:
```powershell
eas build -p android --profile preview
```

### Step 5: Download & Install
When the build completes, EAS prints:
1. A **direct `.apk` download URL** you can distribute to workers or staff.
2. A **QR code** on your terminal screen that you can scan with an Android phone to install the APK immediately.

---

## 6. Verification Checklist

- [x] **Strict Database Seeding**: Only Master Admin (`admin@company.erp`) is initialized. No mock labourers or fake bills exist.
- [x] **2Factor Real SMS OTP**: Integrated with key `6b3149a1-d70f-11f1-ac3e-0200cd936042`. OTP is delivered via SMS and hidden from client responses.
- [x] **Push Notification Isolation**: User tokens are saved in `user_push_tokens` and push messages are strictly queried by `user_id`.
- [x] **Office Location Filtering**: Master Admin filters worksites exclusively by branch/central office location.
- [x] **Solar Icons**: Installed `@solar-icons/react` and integrated across desktop and mobile navigation.
- [x] **Dual URL Routing**: Clean password login at `/admin` and mobile OTP login at `/labour` with instant 1-tap switching.
