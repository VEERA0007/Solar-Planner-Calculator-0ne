# Solar Planner & Calculator

A full-stack solar sizing, 4-state DISCOM utility bill analyzer (Telangana, Andhra Pradesh, Odisha, Chandigarh), DCR/Non-DCR PM Surya Ghar subsidy calculator, rooftop engineering layout planner, and PWA / Android application.

## Option 1: Install Immediately as Android App (PWA)
Open the hosted HTTPS app in **Chrome on Android**, tap **"Install Android / App"** (or Chrome menu -> *Add to Home screen*).
- Configured with `vite-plugin-pwa`, standalone display mode, offline Workbox caching, and compliant `192x192` / `512x512` / `maskable` icons.
- To wrap the live HTTPS URL directly into a standalone `.apk` or Android App Bundle (`.aab`) via PWABuilder: visit `https://www.pwabuilder.com` and paste the published HTTPS URL.

## Option 2: Build a Real `.apk` Automatically on GitHub
This repository includes a ready-to-run **GitHub Actions CI pipeline** (`.github/workflows/build-android-apk.yml`) and `capacitor.config.ts`:
1. Push this repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial Solar Planner & Calculator"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. Open the **Actions** tab in your GitHub repository and wait for **Build Android APK** to complete (~2–3 minutes).
3. Download **`SolarPlannerCalculator-debug-apk`** (`app-debug.apk`) directly from the workflow **Artifacts** section and install it on any Android phone.

## Option 3: Build Locally with Capacitor or Native Kotlin
```bash
npm install
npm run build
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npx cap sync android
npx cap open android
```
Or download the **Native Kotlin & Jetpack Compose** source `.ZIP` directly inside the app's **APK & GitHub** screen.
