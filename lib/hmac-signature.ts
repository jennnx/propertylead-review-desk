import { createHmac, timingSafeEqual } from "node:crypto";

type HmacSignatureInput = {
  secret: string;
  source: string;
  digest?: "base64" | "hex";
};

type HmacSignatureVerificationInput = HmacSignatureInput & {
  signature: string;
};

export function createHmacSignature({
  secret,
  source,
  digest = "base64",
}: HmacSignatureInput): string {
  return createHmac("sha256", secret).update(source, "utf8").digest(digest);
}

export function isHmacSignatureValid({
  signature,
  ...input
}: HmacSignatureVerificationInput): boolean {
  return constantTimeEqual(createHmacSignature(input), signature);
}

function constantTimeEqual(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.byteLength === actualBuffer.byteLength &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}
