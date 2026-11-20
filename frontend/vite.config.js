import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// One stamp per build (YYYYMMDD_HHMM, UTC) — read by src/main.jsx.
const BUILD_STAMP = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 13);

export default defineConfig({
  define: {
    'import.meta.env.VITE_BUILD_STAMP': JSON.stringify(BUILD_STAMP),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',

      // Assets to always precache (app shell)
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-apple.png', 'favicon.ico'],

      workbox: {
        clientsClaim: true,   // New SW takes over all tabs immediately
        skipWaiting: true,    // Skip the waiting phase — no stale content
        cleanupOutdatedCaches: true,

        // Precache the app shell (all core JS/CSS chunks built by Vite)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/node_modules/**', '**/charts-*.js', '**/xlsx-*.js', '**/export-*.js', '**/pdfReport-*.js', 'icon.jpg'],

        // Max precache file size (3 MB)
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,

        // Runtime caching rules
        runtimeCaching: [
          // Heavy chart library chunk — cached on demand via StaleWhileRevalidate instead of upfront precaching
          {
            urlPattern: /\/assets\/charts-.*\.js$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'lazy-chart-chunks',
              expiration: { maxEntries: 6, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          // Navigation requests: NetworkFirst ensures online users always get the freshest index.html with new chunk hashes
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 3,
            }
          },
          // Google Fonts — cache forever
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          // NOTE: Firestore & Firebase Auth are intentionally NOT cached by the service worker.
          // Firestore's real-time channel uses long-polling; intercepting it breaks live sync.
          // Offline data is handled by Firestore's own IndexedDB persistence (see firebase.js).
          // Exchange rates API — StaleWhileRevalidate (use cached, refresh in bg)
          {
            urlPattern: /^https:\/\/api\.exchangerate-api\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'exchange-rates',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 6 } // 6h
            }
          },
          // Crypto prices — StaleWhileRevalidate
          {
            urlPattern: /^https:\/\/api\.coingecko\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'crypto-prices',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 2 } // 2h
            }
          }
        ]
      },

      manifest: {
        name: 'Vault Manager',
        short_name: 'Vault',
        description: 'Advanced Personal Finance & Money Manager — track spending, investments, bills & goals',
        theme_color: '#0d1422',
        background_color: '#0d1422',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait-primary',
        start_url: '/dashboard',
        scope: '/',
        id: 'com.vaultmanager.app',
        lang: 'en',
        categories: ['finance', 'productivity', 'utilities'],

        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],

        // Android & iOS PWA home-screen long-press shortcuts
        shortcuts: [
          {
            name: '⚡ Quick Add Expense',
            short_name: 'Quick Add',
            url: '/dashboard?action=quick-add',
            description: 'Quickly record an expense or income',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: '📲 Paste Bank SMS',
            short_name: 'Paste SMS',
            url: '/dashboard?action=paste-sms',
            description: 'Auto-fill transaction from bank SMS or voice',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: '🧾 Pay Bills',
            short_name: 'Pay Bills',
            url: '/bills',
            description: 'View upcoming bills and mark as paid',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: '📊 Cash-Flow Analytics',
            short_name: 'Analytics',
            url: '/analytics',
            description: 'View cash flow waterfall & spending breakdown',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }]
          }
        ],

        // Related apps (optional — improves Play Store cross-promotion)
        prefer_related_applications: false,
      }
    })
  ],

  build: {
    // Clean dist/ before each build so SW precache only includes current build chunks
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    cssMinify: true,
    chunkSizeWarningLimit: 700,
    // Inline small assets directly in JS (< 4kb)
    assetsInlineLimit: 4096,
    modulePreload: {
      polyfill: false,
      resolveDependencies: (_filename, deps) =>
        deps.filter(
          (dep) =>
            !dep.includes('xlsx-') &&
            !dep.includes('export-') &&
            !dep.includes('pdfReport-') &&
            !dep.includes('charts-')
        ),
    },
    rolldownOptions: {
      output: {
        // Code splitting with explicit priorities. Higher priority claims a
        // module first, so shared runtime (React, react-is, the bundler's
        // dynamic-import preload helper) always lands in 'vendor' instead of
        // being pulled into a lazy feature chunk (charts, PDF export) and
        // dragging that whole chunk into the first page load.
        codeSplitting: {
          groups: [
            { name: 'vendor', priority: 100, test: (id) => id.includes('vite/preload-helper') || id.includes('commonjsHelpers') || /[\\/]node_modules[\\/](react|react-dom|react-is|scheduler|react-router|react-router-dom|lucide-react|react-hot-toast|goober)[\\/]/.test(id) },
            { name: 'firebase-firestore', priority: 90, test: /[\\/]node_modules[\\/](@firebase[\\/]firestore|firebase[\\/]firestore)/ },
            { name: 'firebase-auth', priority: 90, test: /[\\/]node_modules[\\/](@firebase[\\/]auth|firebase[\\/]auth)/ },
            { name: 'firebase-storage', priority: 90, test: /[\\/]node_modules[\\/](@firebase[\\/]storage|firebase[\\/]storage)/ },
            { name: 'firebase-core', priority: 80, test: /[\\/]node_modules[\\/](@firebase|firebase)[\\/]/ },
            { name: 'motion', priority: 70, test: /[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/ },
            // Feature-only libraries: loaded when the feature is opened.
            { name: 'charts', priority: 50, test: /[\\/]node_modules[\\/](recharts|d3-[^/\\]+|victory[^/\\]*|decimal\.js-light|eventemitter3|@reduxjs|redux|reselect|immer|use-sync-external-store|es-toolkit)[\\/]/ },
            { name: 'xlsx', priority: 50, test: /[\\/]node_modules[\\/]xlsx[\\/]/ },
            { name: 'export', priority: 50, test: /[\\/]node_modules[\\/](jspdf|html2canvas|dompurify|canvg|fflate|core-js|raf|rgbcolor|stackblur-canvas|svg-pathdata|performance-now|@babel[\\/]runtime|regenerator-runtime)[\\/]/ },
          ],
        },
      },
    },
  },

  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-router-dom',
      'firebase/app', 'firebase/auth', 'firebase/firestore',
      'framer-motion', 'react-hot-toast'
    ],
  },
})
