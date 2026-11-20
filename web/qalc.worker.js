import createQalc from "./qalc.js";

let pendingOutput = [];
let decoder;
let flushTimer;

self.onmessage = async ({ data }) => {
  if (data.type !== "start" || !data.sab) return;

  const control = new Int32Array(data.sab, 0, 4);
  const buffer = new Uint8Array(data.sab, 16);
  const capacity = buffer.length;
  decoder = new TextDecoder();

  const input = () => {
    while (true) {
      const read = Atomics.load(control, 0);
      const write = Atomics.load(control, 1);
      if (read !== write) {
        const byte = buffer[read];
        Atomics.store(control, 0, (read + 1) % capacity);
        Atomics.notify(control, 0);
        return byte;
      }
      Atomics.wait(control, 1, write);
    }
  };

  const flush = () => {
    clearTimeout(flushTimer);
    if (!pendingOutput.length) return;
    const bytes = Uint8Array.from(pendingOutput);
    pendingOutput = [];
    self.postMessage({ type: "output", text: decoder.decode(bytes, { stream: true }) });
  };

  const write = byte => {
    if (byte === null) return flush();
    pendingOutput.push(byte);
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 8);
    if (pendingOutput.length >= 4096) flush();
  };

  try {
    const runtime = await createQalc({
      noInitialRun: true,
      locateFile: path => new URL(path, self.location.href).href,
      preRun: [Module => Module.FS.init(input, write, write)]
    });

    self.postMessage({ type: "ready" });
    const status = runtime.callMain(["--interactive"]);
    flush();
    self.postMessage({ type: "exited", status });
  } catch (error) {
    flush();
    self.postMessage({ type: "error", text: error instanceof Error ? error.stack || error.message : String(error) });
  }
};
