import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs work both at the GitHub Pages project path and locally.
  base: './',
  preview: {
    allowedHosts: ['4173-i5f8o3s700bceowvuczz3-a17dd2a7.sg2.manus.computer']
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});
