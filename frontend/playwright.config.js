import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./test/browser',testMatch:'**/*.spec.js',fullyParallel:false,workers:1,timeout:30000,
 use:{baseURL:'http://127.0.0.1:5177',trace:'retain-on-failure'},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],
 webServer:{command:'npm run dev:test',url:'http://127.0.0.1:5177/test/browser/index.html',reuseExistingServer:false},
});
