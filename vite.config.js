import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs work both at the GitHub Pages project path and locally.
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});
