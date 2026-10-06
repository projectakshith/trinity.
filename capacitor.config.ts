import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.projectakshith.trinity',
  appName: 'Trinity',
  webDir: 'out',
  server: {
    url: 'https://trinity-eosin.vercel.app',
    allowNavigation: ['trinity-eosin.vercel.app'],
  },
};

export default config;
