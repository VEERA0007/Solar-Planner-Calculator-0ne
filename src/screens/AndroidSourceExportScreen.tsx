import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileCode,
  FolderTree,
  GitBranch,
  Globe,
  PackageCheck,
  Smartphone,
  Terminal,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import JSZip from 'jszip';
import { ANDROID_PROJECT_FILES, AndroidFile } from '../data/androidProjectSource';
import { MaterialTopBar } from '../components/MaterialTopBar';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { ScreenId, WeatherCondition } from '../types/solar';

interface AndroidSourceExportScreenProps {
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
}

const GITHUB_ACTIONS_WORKFLOW_YML = `name: Build Android APK

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Set up Java 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Install dependencies & build web bundle
        run: |
          npm install
          npm run build

      - name: Add Capacitor Android & sync web assets
        run: |
          npm install @capacitor/core @capacitor/cli @capacitor/android
          if [ ! -d "android" ]; then
            npx cap add android
          fi
          npx cap sync android

      - name: Build Debug APK with Gradle
        working-directory: android
        run: |
          chmod +x gradlew
          ./gradlew assembleDebug

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: SolarPlannerCalculator-debug-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 30
`;

const CAPACITOR_CONFIG_TS = `const config = {
  appId: 'com.solarplanner.calculator',
  appName: 'Solar Planner & Calculator',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0F172A',
  },
};

export default config;
`;

const GITHUB_COMMANDS = `git init
git add .
git commit -m "Solar Planner & Calculator Android APK Setup"
git branch -M main
git remote add origin https://github.com/<your-username>/solar-planner-calculator.git
git push -u origin main`;

export const AndroidSourceExportScreen: React.FC<AndroidSourceExportScreenProps> = ({
  onNavigate,
  weather,
  onOpenWeather,
}) => {
  const [activeTab, setActiveTab] = useState<'pwa' | 'github_apk' | 'native_kotlin'>('pwa');
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isExportingNative, setIsExportingNative] = useState(false);
  const [isExportingCi, setIsExportingCi] = useState(false);

  const currentFile: AndroidFile = ANDROID_PROJECT_FILES[selectedFileIndex];
  const liveAppUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://localhost:3000';

  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownloadGithubCiBundle = async () => {
    setIsExportingCi(true);
    try {
      const zip = new JSZip();
      zip.file('.github/workflows/build-android-apk.yml', GITHUB_ACTIONS_WORKFLOW_YML);
      zip.file('capacitor.config.ts', CAPACITOR_CONFIG_TS);
      zip.file(
        'README-APK.md',
        `# Solar Planner & Calculator — GitHub Auto-APK Build\n\n1. Copy the contents of this ZIP into the root of your Solar Planner repository.\n2. Push to GitHub (main branch).\n3. Open GitHub -> Actions -> "Build Android APK".\n4. Download the compiled \`SolarPlannerCalculator-debug-apk\` (\`app-debug.apk\`) artifact and install on any Android phone.\n`
      );

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'SolarPlanner-GitHub-APK-Pipeline.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      try {
        confetti({ particleCount: 70, spread: 65, origin: { y: 0.6 } });
      } catch {}
    } finally {
      setIsExportingCi(false);
    }
  };

  const handleDownloadNativeZip = async () => {
    setIsExportingNative(true);
    try {
      const zip = new JSZip();
      const rootFolder = zip.folder('SolarPlannerCalculator-Android');

      ANDROID_PROJECT_FILES.forEach((f) => {
        rootFolder?.file(f.path, f.content);
      });

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'SolarPlannerCalculator-Android-Project.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      try {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      } catch {}
    } catch (error) {
      console.error('Error generating zip:', error);
    } finally {
      setIsExportingNative(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-900 text-slate-100 pb-10 min-h-full">
      <MaterialTopBar
        title="Android APK, PWA & GitHub Hub"
        subtitle="Install Real Mobile App or Build .APK"
        showBack={true}
        onBack={() => onNavigate('dashboard')}
        weather={weather}
        onOpenWeather={onOpenWeather}
      />

      <div className="p-4 space-y-4 max-w-4xl mx-auto w-full">
        {/* 3 Real Distribution Mode Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-800/90 rounded-2xl border border-slate-700/80 text-[11px] font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('pwa')}
            className={`py-2 px-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'pwa'
                ? 'bg-[#FF6F00] text-white shadow-xs'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Install App (PWA)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('github_apk')}
            className={`py-2 px-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'github_apk'
                ? 'bg-emerald-500 text-slate-950 shadow-xs'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">GitHub Auto-APK</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('native_kotlin')}
            className={`py-2 px-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'native_kotlin'
                ? 'bg-sky-500 text-slate-950 shadow-xs'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Kotlin Source</span>
          </button>
        </div>

        {/* TAB 1: INSTANT ANDROID PWA INSTALL & PWABUILDER APK */}
        {activeTab === 'pwa' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-amber-950/90 via-slate-900 to-slate-900 rounded-3xl p-5 border border-amber-500/30 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                    <PackageCheck className="w-4 h-4" />
                    <span>Standalone Android App (PWA Compliant)</span>
                  </div>
                  <h2 className="text-lg font-extrabold text-white">
                    Install Directly on Android Phone
                  </h2>
                  <p className="text-xs text-slate-300 max-w-lg leading-relaxed">
                    This app is configured with a full Web App Manifest, offline Workbox service worker, and Android home-screen icons. Open this link in Chrome on Android and install it like a native app immediately.
                  </p>
                </div>

                <div className="shrink-0">
                  <PWAInstallButton />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3 space-y-1.5">
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Option A: Android Chrome 1-Tap Install</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Open your live app URL in <strong>Google Chrome</strong> on Android, tap <strong>⋮ Menu → Add to Home screen → Install App</strong>. Runs fullscreen without browser bars.
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3 space-y-1.5">
                  <div className="font-bold text-sky-400 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" />
                    <span>Option B: Instant .APK via PWABuilder</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Copy your live URL below, paste it into{' '}
                    <a
                      href="https://www.pwabuilder.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-300 underline font-bold inline-flex items-center gap-0.5"
                    >
                      PWABuilder.com
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                    , and click <strong>Package for Stores → Android</strong> to download a signed <code>.apk</code> / <code>.aab</code>.
                  </p>
                </div>
              </div>

              {/* Copy Live App URL */}
              <div className="rounded-2xl bg-slate-950 border border-slate-800 p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Your Live App URL (for Android Chrome or PWABuilder)
                  </div>
                  <div className="text-xs font-mono font-semibold text-amber-300 truncate">
                    {liveAppUrl}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyText('url', liveAppUrl)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {copiedKey === 'url' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy URL</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: GITHUB ACTIONS AUTO-APK BUILDER */}
        {activeTab === 'github_apk' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 rounded-3xl p-5 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                  <GitBranch className="w-4 h-4" />
                  <span>Cloud Gradle CI (No Android Studio Needed)</span>
                </div>
                <h2 className="text-lg font-extrabold text-white">
                  Auto-Compile Real .APK on GitHub Actions
                </h2>
                <p className="text-xs text-slate-300 max-w-md leading-relaxed">
                  Includes <code>.github/workflows/build-android-apk.yml</code> &amp; <code>capacitor.config.ts</code> already pre-configured in this project. Push to GitHub to download a compiled <code>app-debug.apk</code> from the Actions tab.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownloadGithubCiBundle}
                disabled={isExportingCi}
                className="shrink-0 py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{isExportingCi ? 'Bundling...' : 'Download CI Config (.ZIP)'}</span>
              </button>
            </div>

            {/* Git Push Commands */}
            <div className="bg-slate-950/90 rounded-2xl p-4 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>1. Push Repo to GitHub (Generates APK Automatically)</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyText('git_cmd', GITHUB_COMMANDS)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'git_cmd' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Commands</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="font-mono text-[11px] text-emerald-300 bg-slate-900 rounded-xl p-3 border border-slate-800 overflow-x-auto">
                {GITHUB_COMMANDS}
              </pre>
              <p className="text-[11px] text-slate-400">
                After pushing, open your repository on GitHub → <strong>Actions</strong> tab → <strong>Build Android APK</strong> → download artifact <strong>SolarPlannerCalculator-debug-apk</strong> (contains <code>app-debug.apk</code>).
              </p>
            </div>

            {/* Workflow YAML Preview */}
            <div className="bg-slate-950/90 rounded-2xl p-4 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-200">
                  .github/workflows/build-android-apk.yml
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyText('yml', GITHUB_ACTIONS_WORKFLOW_YML)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'yml' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy YAML</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="font-mono text-[10.5px] text-slate-300 bg-slate-900 rounded-xl p-3 border border-slate-800 max-h-64 overflow-auto">
                {GITHUB_ACTIONS_WORKFLOW_YML}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 3: NATIVE KOTLIN & JETPACK COMPOSE PROJECT (.ZIP) */}
        {activeTab === 'native_kotlin' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-sky-950 via-slate-900 to-slate-900 rounded-3xl p-5 border border-sky-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sky-400 font-bold text-xs uppercase tracking-wider">
                  <Smartphone className="w-4 h-4" />
                  <span>Native Android Architecture (Material 3)</span>
                </div>
                <h2 className="text-lg font-extrabold text-white">
                  Download Native Android Studio Project
                </h2>
                <p className="text-xs text-slate-300 max-w-md">
                  Complete Gradle configuration, Room Database, ViewModels, Material 3 Composables, and solar math formulas ready to build in Android Studio.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownloadNativeZip}
                disabled={isExportingNative}
                className="shrink-0 py-3 px-5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{isExportingNative ? 'Generating ZIP...' : 'Download Kotlin (.ZIP)'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-slate-950/80 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
              <div className="md:col-span-4 border-b md:border-b-0 md:border-r border-slate-800 p-3 space-y-2 bg-slate-900/50">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                  <FolderTree className="w-4 h-4 text-sky-400" />
                  <span>Project Files</span>
                </div>

                <div className="space-y-1 max-h-[360px] md:max-h-[480px] overflow-y-auto pr-1">
                  {ANDROID_PROJECT_FILES.map((file, idx) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => setSelectedFileIndex(idx)}
                      className={`w-full text-left p-2.5 rounded-xl text-xs transition flex items-center justify-between gap-2 cursor-pointer ${
                        selectedFileIndex === idx
                          ? 'bg-sky-600/30 text-sky-300 border border-sky-500/40 font-semibold'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCode
                          className={`w-3.5 h-3.5 shrink-0 ${
                            file.language === 'kotlin'
                              ? 'text-purple-400'
                              : file.language === 'xml'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        />
                        <span className="truncate text-[11px]">{file.name}</span>
                      </div>
                      <span className="text-[9px] uppercase px-1 rounded bg-slate-800 text-slate-400">
                        {file.language}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-8 flex flex-col p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div>
                    <div className="text-xs font-mono font-bold text-slate-200">
                      {currentFile.path}
                    </div>
                    <div className="text-[11px] text-slate-400">{currentFile.description}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopyText('kotlin_code', currentFile.content)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {copiedKey === 'kotlin_code' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="relative flex-1 bg-slate-900 rounded-2xl p-3 border border-slate-800/80 overflow-auto max-h-[420px]">
                  <pre className="font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre font-normal select-all">
                    {currentFile.content}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
