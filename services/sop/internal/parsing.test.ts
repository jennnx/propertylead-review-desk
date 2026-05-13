import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { extractSopText } from "./parsing";

const PDF_FIXTURE_PATH = path.join(
  __dirname,
  "__fixtures__",
  "sample.pdf",
);

describe("extractSopText", () => {
  test("reads text/plain as UTF-8 and normalizes whitespace", async () => {
    const buffer = Buffer.from(
      "Call hot seller leads within five minutes.\r\n\r\n\r\nFollow up twice the first day.   \n",
    );

    await expect(extractSopText(buffer, "text/plain")).resolves.toBe(
      "Call hot seller leads within five minutes.\n\nFollow up twice the first day.",
    );
  });

  test("reads text/markdown as UTF-8 and preserves heading markers", async () => {
    const buffer = Buffer.from(
      "# Seller Playbook\n\n## Hot Leads\n\nCall hot seller leads within five minutes.\n",
    );

    await expect(extractSopText(buffer, "text/markdown")).resolves.toBe(
      "# Seller Playbook\n\n## Hot Leads\n\nCall hot seller leads within five minutes.",
    );
  });

  test("extracts visible text from a real application/pdf buffer", async () => {
    const buffer = await readFile(PDF_FIXTURE_PATH);

    const text = await extractSopText(buffer, "application/pdf");

    expect(text).toContain("PropertyLead SOP Test Fixture");
    expect(text).toContain("Call hot seller leads within five minutes.");
    expect(text).toContain("Follow up twice the first day.");
  });

  test("throws a descriptive error when an application/pdf buffer is unparseable", async () => {
    const corruptPdf = Buffer.from("%PDF-1.4 this is not a real pdf");

    await expect(
      extractSopText(corruptPdf, "application/pdf"),
    ).rejects.toThrow(/SOP Document PDF could not be parsed/);
  });

  test("throws when the parsed application/pdf buffer contains no extractable text", async () => {
    const emptyPdf = Buffer.from(
      "%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\nxref\n0 3\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\ntrailer<</Size 3/Root 1 0 R>>\nstartxref\n98\n%%EOF",
    );

    await expect(
      extractSopText(emptyPdf, "application/pdf"),
    ).rejects.toThrow(/SOP Document/);
  });

  test("throws for unsupported content types", async () => {
    await expect(
      extractSopText(Buffer.from("hello"), "image/png"),
    ).rejects.toThrow(/Unsupported SOP Document content type/);
  });
});
