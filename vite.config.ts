import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig({
  // Göreli yollar: site hem kök dizinde hem de GitHub Pages'in
  // /<repo-adi>/ alt yolunda repo adını bilmeye gerek kalmadan çalışır.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
