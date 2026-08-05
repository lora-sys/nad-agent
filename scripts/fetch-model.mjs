/**
 * Download a GGUF model over HTTPS into ./models/ with resume + integrity check.
 *
 * Exports:
 *   GGUFDownloader   — class for download + verify + resume logic
 *   getRemoteSize    — HEAD request to get Content-Length
 *   computeMD5       — MD5 checksum of a local file
 *
 * CLI (unchanged):
 *   node scripts/fetch-model.mjs <gguf-url> [outfile.gguf]
 */

import { createWriteStream, existsSync, mkdirSync, statSync, readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// GGUFDownloader
// ---------------------------------------------------------------------------

export class GGUFDownloader {
  constructor(filePath, opts = {}) {
    this.filePath = filePath;
    this.progress = opts.progress !== false;
    this.onProgress = opts.onProgress || null;
  }

  /**
   * Main download entry point. Accepts factory functions for fetch and
   * stream creation so tests can inject mocks.
   *
   * Strategy:
   *  1. If a partial file exists, try a Range request.
   *  2. Validate the server's response (206 = resume OK, 200 = no resume, 416 = can't resume).
   *  3. Stream to disk, appending if resuming.
   *  4. Call verifyFile if the server declared a Content-Length or checksum.
   */
  async download(fetchFn) {
    const hasPartial = existsSync(this.filePath);
    const existingSize = hasPartial ? statSync(this.filePath).size : 0;
    let res;

    if (hasPartial && existingSize > 0) {
      res = await fetchFn("GET", undefined, {
        headers: { Range: `bytes=${existingSize}-` },
      });
    } else {
      res = await fetchFn("GET", undefined, {});
    }

    const contentLength = Number(res.headers.get("Content-Length") || 0);
    // For 206: Content-Length is the remaining chunk size, not total.
    // Parse total from Content-Range if available.
    let totalDeclared = contentLength;
    if (res.status === 206) {
      const range = res.headers.get("Content-Range");
      if (range) {
        const totalMatch = range.match(/\/(\d+)$/);
        if (totalMatch) totalDeclared = Number(totalMatch[1]);
      }
    }

    // --- Resume validation ---
    if (hasPartial && existingSize > 0) {
      if (res.status === 206) {
        const range = res.headers.get("Content-Range");
        if (!range) throw new ResumeCheckFailed("206 without Content-Range");
        const match = range.match(/bytes (\d+)-/);
        if (!match) throw new ResumeCheckFailed(`unparseable Content-Range: ${range}`);
        const serverOffset = Number(match[1]);
        if (serverOffset !== existingSize) {
          throw new ResumeCheckFailed(
            `partial size (${existingSize}) doesn't match server offset (${serverOffset}); delete and retry`,
          );
        }
      } else if (res.status === 200) {
        console.warn(`server doesn't support resume; starting fresh download`);
      } else if (res.status === 416) {
        throw new ResumeCheckFailed(
          `server returned 416 (Range Not Satisfiable); partial may be corrupt, delete ${this.filePath} and retry`,
        );
      } else {
        throw new ResumeCheckFailed(`unexpected status ${res.status} during resume attempt`);
      }
    }

    if (!res.ok) {
      throw new FetchFailed(`${res.status} ${res.statusText}`);
    }

    // --- Stream to disk ---
    const writeMode = (hasPartial && existingSize > 0 && res.status === 206) ? "a" : "w";
    const body = Readable.fromWeb(res.body);

    await new Promise((resolve, reject) => {
      const ws = createWriteStream(this.filePath, { flags: writeMode });
      let received = existingSize;
      body.on("data", (chunk) => {
        received += chunk.length;
        if (this.progress && contentLength) {
          // For 206, report progress against the chunk; for 200, against total.
          const denominator = res.status === 206 ? contentLength : totalDeclared;
          const pct = ((received / (denominator + (res.status === 206 ? existingSize : 0))) * 100).toFixed(1);
          process.stdout.write(`\r  ${pct}%   `);
        }
      });
      pipeline(body, ws).then(resolve, reject);
    });

    if (this.progress) {
      if (contentLength) process.stdout.write(`\n`);
      this._reportProgress(100);
    }

    // --- Verify ---
    if (totalDeclared) await this.verifyFile({ contentLength: String(totalDeclared) });
  }

  /**
   * Verify the downloaded file against declared Content-Length and/or
   * Content-MD5 header from the original response.
   */
  async verifyFile({ contentLength, checksum } = {}) {
    const actualSize = statSync(this.filePath).size;

    if (contentLength && actualSize !== Number(contentLength)) {
      throw new IntegrityError(
        `Content-Length mismatch: declared ${contentLength} bytes, got ${actualSize} bytes`,
      );
    }

    if (checksum) {
      const expected = checksum.trim();
      // Content-MD5 is base64-encoded; accept that format
      const actual = computeMD5(this.filePath);
      if (actual !== expected) {
        throw new IntegrityError(
          `MD5 mismatch: expected ${expected}, got ${actual}`,
        );
      }
    }
  }

  _reportProgress(pct) {
    if (this.onProgress) {
      this.onProgress(`${pct.toFixed(1)}%`);
    }
  }
}

// ---------------------------------------------------------------------------
// Resume error types
// ---------------------------------------------------------------------------

export class ResumeCheckFailed extends Error {
  constructor(message) {
    super(`resume check failed: ${message}`);
    this.name = "ResumeCheckFailed";
  }
}

export class FetchFailed extends Error {
  constructor(message) {
    super(`fetch failed: ${message}`);
    this.name = "FetchFailed";
  }
}

export class IntegrityError extends Error {
  constructor(message) {
    super(`integrity error: ${message}`);
    this.name = "IntegrityError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Send a HEAD request and return Content-Length (0 if absent). */
export async function getRemoteSize(fetchFn) {
  const res = await fetchFn("HEAD", undefined, {});
  if (!res.ok) throw new FetchFailed(`${res.status} ${res.statusText}`);
  return Number(res.headers.get("Content-Length") || 0);
}

/** Base64-encoded MD5 of a local file, or "" if missing. */
export function computeMD5(filePath) {
  if (!existsSync(filePath)) return "";
  const hash = createHash("md5");
  hash.update(readFileSync(filePath));
  return hash.digest("base64");
}

/** Read a file into a Buffer for test assertions. */
export function readFile(path) {
  return readFileSync(path);
}

// ---------------------------------------------------------------------------
// CLI entry point (unchanged interface)
// ---------------------------------------------------------------------------

const url = process.argv[2];
if (url) {
  mkdirSync("models", { recursive: true });
  const out = join("models", process.argv[3] || basename(new URL(url).pathname) || "model.gguf");

  console.log(`downloading\n  ${url}\n-> ${out}`);

  const dl = new GGUFDownloader(out);
  try {
    await dl.download(
      (method, _body, init) => fetch(url, { ...init, method, redirect: "follow" }),
    );
    console.log(`\ndone. Add to .env:\n\n  QVAC_MODEL_PATH=${join(process.cwd(), out)}\n`);
  } catch (e) {
    console.error(`\nfailed: ${e.message}`);
    process.exit(1);
  }
}
