export function decodeHubSpotSignatureUri(uri: string): string {
  return uri.replace(/%(3A|2F|3F|40|21|24|27|28|29|2A|2C|3B)/gi, (match) =>
    decodeURIComponent(match),
  );
}
