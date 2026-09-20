import{defineConfig}from'@playwright/test';

export default defineConfig({
  testDir:'./tests',
  timeout:30000,
  retries:1,
  use:{
    baseURL:'http://127.0.0.1:4173',
    headless:true,
    viewport:{width:1440,height:1000}
  },
  webServer:{
    command:'npm run build && npm run preview -- --host 127.0.0.1',
    url:'http://127.0.0.1:4173/moodtrip',
    reuseExistingServer:true,
    timeout:120000
  }
});
