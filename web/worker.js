// web/terminal.worker.js
import createQalc from "./qalc.js";
self.onmessage = async ({ data }) => {
  if (data.type !== "start" || !data.sab) return;
  const control = new Int32Array(data.sab, 0, 4);
  const buffer = new Uint8Array(data.sab, 16);
  const capacity = buffer.length;
  const decoder = new TextDecoder();
  let lineFinished = false;
  const input = () => {
    if (lineFinished) {
      lineFinished = false;
      return null;
    }
    while (true) {
      const read = Atomics.load(control, 0);
      const write2 = Atomics.load(control, 1);
      if (read !== write2) {
        const byte = buffer[read];
        Atomics.store(control, 0, (read + 1) % capacity);
        Atomics.notify(control, 0);
        if (byte === 10) lineFinished = true;
        return byte;
      }
      Atomics.wait(control, 1, write2);
    }
  };
  const write = (byte) => {
    if (byte === null) return;
    const text = decoder.decode(Uint8Array.of(byte), { stream: true });
    if (text) self.postMessage({ type: "output", text });
  };
  try {
    self.postMessage({ type: "startup", text: "Loading Qalculate runtime\u2026\r\n" });
    const runtime = await createQalc({
      noInitialRun: true,
      locateFile: (path) => new URL(path, self.location.href).href,
      preRun: [(Module) => {
        Module.FS.mkdirTree("/project/wasm-deps/share");
        if (!Module.FS.analyzePath("/project/wasm-deps/share/qalculate").exists) {
          Module.FS.symlink("/share/qalculate", "/project/wasm-deps/share/qalculate");
        }
        Module.FS.init(input, write, write);
      }]
    });
    self.postMessage({ type: "startup", text: "Starting interactive session\u2026\r\n" });
    self.postMessage({ type: "ready" });
    const status = runtime.callMain(["--interactive"]);
    if (Number.isInteger(status) && status !== 0) self.postMessage({ type: "exited", status });
  } catch (error) {
    self.postMessage({ type: "error", text: error instanceof Error ? error.stack || error.message : String(error) });
  }
};
