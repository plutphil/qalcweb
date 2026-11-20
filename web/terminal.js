import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const container = document.getElementById("terminal");
const terminal = new Terminal({
  cursorBlink: true,
  fontFamily: '"Cascadia Code", "DejaVu Sans Mono", monospace',
  fontSize: 15,
  convertEol: true,
  scrollback: 10000,
  theme: {
    background: "#11151c",
    foreground: "#e6edf3",
    cursor: "#58a6ff",
    selectionBackground: "#264f78"
  }
});
const fit = new FitAddon();
terminal.loadAddon(fit);
terminal.open(container);
fit.fit();
terminal.writeln("Starting Qalculate WebAssembly…");

if (typeof SharedArrayBuffer === "undefined" || typeof Atomics === "undefined") {
  terminal.writeln("\r\nSharedArrayBuffer is unavailable. Serve this site with cross-origin isolation enabled.");
  terminal.options.disableStdin = true;
} else {
  const worker = new Worker(new URL("./terminal.worker.js", import.meta.url), { type: "module" });
  const capacity = 65536;
  const sab = new SharedArrayBuffer(16 + capacity);
  const control = new Int32Array(sab, 0, 4);
  const buffer = new Uint8Array(sab, 16);
  const encoder = new TextEncoder();

  let ready = false;
  let inputLine = "";
  const sendInput = text => {
    const encoded = encoder.encode(text);
    for (const byte of encoded) {
      const read = Atomics.load(control, 0);
      const write = Atomics.load(control, 1);
      const next = (write + 1) % capacity;
      if (next === read) {
        terminal.write("\u0007");
        return false;
      }
      buffer[write] = byte;
      Atomics.store(control, 1, next);
      Atomics.notify(control, 1);
    }
    return true;
  };

  const resize = () => {
    fit.fit();
    worker.postMessage({ type: "resize", cols: terminal.cols, rows: terminal.rows });
  };

  worker.onmessage = ({ data }) => {
    if (data.type === "output" || data.type === "startup") terminal.write(data.text);
    if (data.type === "ready") {
      ready = true;
      terminal.options.disableStdin = false;
      resize();
      terminal.focus();
    }
    if (data.type === "exited") terminal.writeln(`\r\n[Qalculate exited with status ${data.status}]`);
    if (data.type === "error") terminal.writeln(`\r\n${data.text}`);
  };

  worker.onerror = event => terminal.writeln(`\r\nWorker error: ${event.message}`);
  worker.postMessage({ type: "start", sab });

  terminal.onData(data => {
    if (!ready) return;
    data = data.replace(/\r/g, "\n");

    for (const character of data) {
      if (character === "\n") {
        terminal.write("\r\n");
        sendInput(`${inputLine}\n`);
        inputLine = "";
      } else if (character === "\u007f" || character === "\b") {
        if (!inputLine) continue;
        const characters = [...inputLine];
        characters.pop();
        inputLine = characters.join("");
        terminal.write("\b \b");
      } else if (character === "\u0003") {
        inputLine = "";
        terminal.write("^C\r\n> ");
      } else if (character >= " ") {
        inputLine += character;
        terminal.write(character);
      }
    }
  });

  window.addEventListener("resize", resize);
}
