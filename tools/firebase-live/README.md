# vendor/firebase-live.js

The Firebase pieces Rush Hour needs (app, anonymous auth, Realtime Database), bundled once into a plain
script so the game keeps working without a bundler or a network CDN:

    npm i firebase@13.0.0 esbuild@0.25.10
    npx esbuild tools/firebase-live/entry.js --bundle --minify --format=iife --target=es2019 \
      --legal-comments=eof --outfile=vendor/firebase-live.js

Auth is set up with initializeAuth() and IndexedDB persistence only (no popup/redirect resolver), which is
what works inside the Capacitor WebView on Android and iOS.
