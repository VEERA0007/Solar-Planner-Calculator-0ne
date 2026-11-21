import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.solarplanner.calculator',
  appName: 'Solar Planner & Calculator',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0F172A',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0F172A',
  },
};

export default config;
