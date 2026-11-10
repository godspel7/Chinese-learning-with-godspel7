import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1500 },
  // cho phép chạy `vite preview` trên Render (Web Service) với tên miền onrender.com
  preview: { allowedHosts: ['.onrender.com'] },
});
