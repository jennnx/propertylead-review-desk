import { describe, expect, test } from "vitest";

import { createHmacSignature, isHmacSignatureValid } from "./hmac-signature";

describe("HMAC signature utilities", () => {
  test("creates a SHA-256 HMAC signature", () => {
    expect(
      createHmacSignature({
        secret: "Jefe",
        source: "what do ya want for nothing?",
        digest: "hex",
      }),
    ).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  });

  test("validates a matching base64 SHA-256 HMAC signature", () => {
    expect(
      isHmacSignatureValid({
        secret: "Jefe",
        source: "what do ya want for nothing?",
        signature: "W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM=",
      }),
    ).toBe(true);
  });

  test("rejects a mismatched SHA-256 HMAC signature", () => {
    expect(
      isHmacSignatureValid({
        secret: "Jefe",
        source: "what do ya want for nothing?",
        signature: "not-the-signature",
      }),
    ).toBe(false);
  });
});
