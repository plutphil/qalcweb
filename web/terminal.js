import "@xterm/xterm/css/xterm.css";
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
const updateViewport = () => {
  const viewport = window.visualViewport;
  if (!viewport) return;
  container.style.top = `${viewport.offsetTop}px`;
  container.style.left = `${viewport.offsetLeft}px`;
  container.style.width = `${viewport.width}px`;
  container.style.height = `${viewport.height}px`;
};
updateViewport();
fit.fit();
terminal.writeln("Starting Qalculate WebAssembly…");

if (!window.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
  terminal.writeln("\r\nSharedArrayBuffer is unavailable: this page is not cross-origin isolated.");
  terminal.writeln("Open the app through `npm run serve` at http://localhost:8080, not VS Code Live Preview.");
  terminal.options.disableStdin = true;
} else {
  const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  const capacity = 65536;
  const sab = new SharedArrayBuffer(16 + capacity);
  const control = new Int32Array(sab, 0, 4);
  const buffer = new Uint8Array(sab, 16);
  const encoder = new TextEncoder();

  let ready = false;
  let inputLine = "";
  let inputCursor = 0;
  let editing = false;
  const history = [];
  let historyIndex = 0;
  let historyDraft = "";

  const redrawInput = () => {
    if (!editing) {
      terminal.write("\x1b7");
      editing = true;
    }
    const characters = [...inputLine];
    terminal.write(`\x1b8\x1b[J${inputLine}\x1b8${characters.slice(0, inputCursor).join("")}`);
  };

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
    const atBottom = terminal.buffer.active.viewportY === terminal.buffer.active.baseY;
    updateViewport();
    fit.fit();
    if (atBottom) terminal.scrollToBottom();
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

    for (const character of data.match(/\x1b(?:\[[0-?]*[ -/]*[@-~]|O.)|[\s\S]/gu) || []) {
      const characters = [...inputLine];
      if (character === "\n") {
        if (editing) terminal.write(`\x1b8\x1b[J${inputLine}`);
        terminal.write("\r\n");
        sendInput(`${inputLine}\n`);
        if (inputLine && history[history.length - 1] !== inputLine) history.push(inputLine);
        inputLine = "";
        inputCursor = 0;
        editing = false;
        historyIndex = history.length;
        historyDraft = "";
      } else if (character === "\u007f" || character === "\b") {
        if (!inputCursor) continue;
        characters.splice(--inputCursor, 1);
        inputLine = characters.join("");
        redrawInput();
      } else if (character === "\u0003") {
        inputLine = "";
        inputCursor = 0;
        editing = false;
        historyIndex = history.length;
        historyDraft = "";
        terminal.write("^C\r\n> ");
      } else if (character === "\x1b[A" || character === "\x1bOA") {
        if (!historyIndex) continue;
        if (historyIndex === history.length) historyDraft = inputLine;
        inputLine = history[--historyIndex];
        inputCursor = [...inputLine].length;
        redrawInput();
      } else if (character === "\x1b[B" || character === "\x1bOB") {
        if (historyIndex >= history.length) continue;
        historyIndex++;
        inputLine = historyIndex === history.length ? historyDraft : history[historyIndex];
        inputCursor = [...inputLine].length;
        redrawInput();
      } else if (character === "\x1b[D" || character === "\x1bOD") {
        if (inputCursor) { inputCursor--; redrawInput(); }
      } else if (character === "\x1b[C" || character === "\x1bOC") {
        if (inputCursor < characters.length) { inputCursor++; redrawInput(); }
      } else if (["\x1b[H", "\x1bOH", "\x1b[1~", "\x1b[7~", "\u0001"].includes(character)) {
        inputCursor = 0;
        redrawInput();
      } else if (["\x1b[F", "\x1bOF", "\x1b[4~", "\x1b[8~", "\u0005"].includes(character)) {
        inputCursor = characters.length;
        redrawInput();
      } else if (character === "\x1b[3~") {
        if (inputCursor >= characters.length) continue;
        characters.splice(inputCursor, 1);
        inputLine = characters.join("");
        redrawInput();
      } else if (character.startsWith("\x1b")) {
        continue;
      } else if (character >= " ") {
        characters.splice(inputCursor++, 0, character);
        inputLine = characters.join("");
        redrawInput();
      }
    }
  });

  window.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("scroll", resize);
}
