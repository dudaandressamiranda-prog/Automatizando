import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Publica em <repo>/mari/ (GitHub Pages serve a raiz do repositório).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: '../mari', emptyOutDir: true },
});
