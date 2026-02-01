import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.touhou.isekai.izakaya',
  appName: 'Touhou Isekai Izakaya',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
