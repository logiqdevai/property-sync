// Minimal magic-byte signatures for the image formats this app actually
// uploads (JPEG/PNG/GIF/WebP). Used to catch a "successful" image download
// that isn't really image bytes at all: some bot-protection layers
// (Cloudflare, SiteGround's "sgcaptcha", etc.) respond to a scraped image
// URL with HTTP 200 and a tiny HTML captcha/redirect page instead of an
// honest 403 -- that passes a plain `response.ok` check and, without this,
// gets uploaded to the CRM as a broken "photo" (confirmed in production:
// lafazanihomes.com served a 218-byte `<html><meta http-equiv="refresh"
// content="0;/.well-known/sgcaptcha/...">` page with a 200 status for a
// server-side fetch(), while the exact same URL 403s outright from other
// networks -- the response shape is inconsistent per-request, so checking
// only the HTTP status is not reliable for these sites).
export function isLikelyImageBuffer(
  buffer: Buffer | null | undefined,
): boolean {
  if (!buffer || buffer.length < 12) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }
  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }
  // GIF: "GIF8"
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return true;
  }
  // WebP: "RIFF"....'WEBP'
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return true;
  }

  return false;
}
