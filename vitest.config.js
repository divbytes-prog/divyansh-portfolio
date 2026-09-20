import{defineConfig}from'vitest/config';

export default defineConfig({
  test:{
    include:['src/**/*.test.js','src/**/*.test.jsx'],
    exclude:['tests/**','node_modules/**','dist/**']
  }
});
