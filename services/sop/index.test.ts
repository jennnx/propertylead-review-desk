import { describe, expect, test } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

describe("SOP service", () => {
  test("exposes the flat public API stubs for SOP library and retrieval operations", async () => {
    const sop = await importWithRequiredEnv(() => import("./index"));

    expect(sop.uploadSopDocument).toEqual(expect.any(Function));
    expect(sop.listSopDocuments).toEqual(expect.any(Function));
    expect(sop.getSopDocument).toEqual(expect.any(Function));
    expect(sop.deleteSopDocument).toEqual(expect.any(Function));
    expect(sop.retrieveRelevantSopChunks).toEqual(expect.any(Function));
  });

  // TODO: Delete when the SOP operation implementation slices replace these stubs.
  test("keeps SOP library operations unavailable until their implementation slices land", async () => {
    const {
      deleteSopDocument,
      getSopDocument,
      listSopDocuments,
      uploadSopDocument,
    } = await importWithRequiredEnv(() => import("./index"));

    await expect(
      uploadSopDocument({
        originalFilename: "playbook.txt",
        contentType: "text/plain",
        byteSize: 7,
        body: Buffer.from("playbook"),
      }),
    ).rejects.toThrow("not implemented");
    await expect(listSopDocuments()).rejects.toThrow("not implemented");
    await expect(getSopDocument("sop-doc-1")).rejects.toThrow("not implemented");
    await expect(deleteSopDocument("sop-doc-1")).rejects.toThrow(
      "not implemented",
    );
  });
});
