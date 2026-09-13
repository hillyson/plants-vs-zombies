import { defineConfig } from 'vite';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const local = path => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  base: './',
  plugins: [{
    name: 'portable-classic-scripts',
    generateBundle() {
      for (const file of ['engine.js', 'app.js']) this.emitFile({ type: 'asset', fileName: file, source: readFileSync(local(file), 'utf8') });
    },
    closeBundle() {
      cpSync(local('assets'), local('dist/assets'), { recursive: true });
      // Classic local-file styles must not use CORS mode (file:// has a null origin).
      const htmlPath = local('dist/index.html');
      writeFileSync(htmlPath, readFileSync(htmlPath, 'utf8').replace(/ crossorigin(?:="[^"]*")?/g, ''));
    }
  }]
});
