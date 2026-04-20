import net from "node:net";

/**
 * Minimal clamd client. Speaks the INSTREAM protocol over TCP:
 *
 *   → zINSTREAM\0
 *   → <4-byte LE length><bytes>...
 *   → <4-byte LE length=0>
 *   ← "stream: OK\0"  or  "stream: <SIG> FOUND\0"
 *
 * Why not an npm package? The protocol is 30 lines of code and avoids
 * another supply-chain surface for a security-critical component.
 *
 * Env:
 *   CLAMAV_HOST   — TCP host (e.g. "clamav" in Compose, "10.0.0.3" in prod)
 *   CLAMAV_PORT   — defaults to 3310
 *   CLAMAV_TIMEOUT_MS — defaults to 30_000
 *
 * `virusScanEnabled()` returns false if CLAMAV_HOST isn't set, and the
 * indexer's scan loop knows to mark files "skipped" in that case.
 */

const CHUNK_SIZE = 64 * 1024;

export function virusScanEnabled(): boolean {
  return Boolean(process.env.CLAMAV_HOST);
}

export type ScanResult =
  | { kind: "clean" }
  | { kind: "infected"; signature: string }
  | { kind: "error"; message: string };

export async function scanBytes(bytes: Uint8Array): Promise<ScanResult> {
  const host = process.env.CLAMAV_HOST;
  if (!host) return { kind: "error", message: "CLAMAV_HOST not set" };
  const port = Number(process.env.CLAMAV_PORT ?? 3310);
  const timeoutMs = Number(process.env.CLAMAV_TIMEOUT_MS ?? 30_000);

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let responded = false;
    const buffers: Buffer[] = [];

    const timer = setTimeout(() => {
      if (responded) return;
      responded = true;
      socket.destroy();
      resolve({ kind: "error", message: `clamav timeout after ${timeoutMs}ms` });
    }, timeoutMs);

    socket.on("error", (err) => {
      if (responded) return;
      responded = true;
      clearTimeout(timer);
      resolve({ kind: "error", message: err.message });
    });

    socket.on("data", (chunk: Buffer) => {
      buffers.push(chunk);
    });

    socket.on("close", () => {
      if (responded) return;
      responded = true;
      clearTimeout(timer);
      const text = Buffer.concat(buffers).toString("utf-8").replace(/\0$/, "");
      if (/FOUND$/m.test(text)) {
        const match = text.match(/stream:\s*(\S+)\s+FOUND/);
        resolve({
          kind: "infected",
          signature: match?.[1] ?? "UNKNOWN",
        });
      } else if (/OK$/m.test(text)) {
        resolve({ kind: "clean" });
      } else {
        resolve({ kind: "error", message: `unexpected clamd response: ${text}` });
      }
    });

    socket.on("connect", () => {
      // zINSTREAM uses NUL terminator; INSTREAM uses newline. Pick z-form so
      // we don't need to send extra framing.
      socket.write("zINSTREAM\0");

      // Stream the payload in CHUNK_SIZE blocks, each prefixed with a
      // 4-byte big-endian length. Terminate with a zero-length block.
      const data = Buffer.from(bytes);
      let offset = 0;
      while (offset < data.length) {
        const end = Math.min(offset + CHUNK_SIZE, data.length);
        const slice = data.subarray(offset, end);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(slice.length, 0);
        socket.write(len);
        socket.write(slice);
        offset = end;
      }
      const zero = Buffer.alloc(4);
      zero.writeUInt32BE(0, 0);
      socket.write(zero);
      // clamd closes the connection after responding.
    });
  });
}
