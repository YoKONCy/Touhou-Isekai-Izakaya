import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.touhou.isekai.izakaya',
  appName: '东方异界食堂',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    cleartext: true
  }
};

export default config;
