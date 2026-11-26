# Qalc Web

<https://plutphil.github.io/qalcweb/web/>

Run libqalculate in a WebAssembly worker in your browser.

```sh
npm install
npm run serve
```

Open <http://localhost:8080>.

This app requires `SharedArrayBuffer` and cross-origin isolation (COOP/COEP headers). VS Code Live Preview uses a different server and cannot provide these headers, so it cannot run the interactive WebAssembly build.