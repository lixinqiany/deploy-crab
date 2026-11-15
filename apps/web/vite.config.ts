import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import svgr from 'vite-plugin-svgr';

export default defineConfig({
  plugins: [react(), tailwindcss(), svgr()],
  // 按 tsconfig.json 的 paths 解析 `@/*`，别名只在 tsconfig 里定义一次
  resolve: { tsconfigPaths: true },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '^/api(?:/|$|\\?)': `http://127.0.0.1:${process.env.PORT ?? 3000}`,
    },
  },
  preview: {
    port: Number(process.env.WEB_PORT ?? 5173),
  },
});
