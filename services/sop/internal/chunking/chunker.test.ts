import { describe, expect, test } from "vitest";

import { chunkSopText } from "./chunker";

describe("chunkSopText", () => {
  test("returns no chunks for empty input", async () => {
    await expect(chunkSopText(" \n\n\t ", "text/plain")).resolves.toEqual([]);
  });

  test("keeps short plain text as one chunk", async () => {
    await expect(
      chunkSopText("Call new seller leads within five minutes.", "text/plain"),
    ).resolves.toEqual([
      {
        ordinal: 0,
        text: "Call new seller leads within five minutes.",
      },
    ]);
  });

  test("prefixes markdown heading context onto chunks that no longer carry their headings", async () => {
    const body = makeWords("pricing", 360).join(" ");
    const chunks = await chunkSopText(
      `# Lead Review\n\n## Pricing Objection\n\n${body}`,
      "text/markdown",
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(
      chunks.some((chunk) =>
        chunk.text.startsWith("Lead Review > Pricing Objection\n\n"),
      ),
    ).toBe(true);
  });

  test("keeps adjacent plain-text chunks near the configured overlap", async () => {
    const chunks = await chunkSopText(makeWords("step", 360).join(" "), "text/plain");

    expect(chunks.length).toBeGreaterThan(1);

    const firstTokens = tokenize(chunks[0]?.text ?? "");
    const secondTokens = tokenize(chunks[1]?.text ?? "");
    const firstTail = new Set(firstTokens.slice(-30));
    const secondHead = secondTokens.slice(0, 60);
    const overlapCount = secondHead.filter((token) => firstTail.has(token)).length;

    expect(firstTokens.length).toBeLessThanOrEqual(310);
    expect(overlapCount).toBeGreaterThanOrEqual(20);
  });
});

function makeWords(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`);
}

function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}
