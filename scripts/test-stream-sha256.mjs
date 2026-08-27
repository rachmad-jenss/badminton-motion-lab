import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256File } from "./stream-sha256.mjs";

const directory = await mkdtemp(join(tmpdir(), "bml-sha256-"));
try {
  const file = join(directory, "payload.bin");
  const payload = Buffer.alloc(2 * 1024 * 1024 + 17, 0x5a);
  await writeFile(file, payload);
  const expected = createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase();
  assert.equal(await sha256File(file), expected);
  console.log("stream sha256 test passed");
} finally {
  await rm(directory, { recursive: true, force: true });
}
