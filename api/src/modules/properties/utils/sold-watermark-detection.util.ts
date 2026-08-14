import { Jimp } from 'jimp';

// Some agencies mark a listing "sold" by baking a solid red stamp into the pixels of the cover
// photo instead of exposing any page text/markup — this can't be scraped normally, so instead we
// detect the stamp itself via a cheap local pixel-color heuristic (no AI/vision calls, no external
// API cost). Calibrated against creta-invest.gr: active listings' cover photos measured 0%-0.39%
// "stamp red" pixels, sold listings' cover photos measured 14%+ -- 1% leaves comfortable margin
// on both sides.
const RED_STAMP_PIXEL_RATIO_THRESHOLD = 0.01;

function isStampRedPixel(r: number, g: number, b: number): boolean {
  return r > 140 && r - g > 60 && r - b > 60 && g < 110 && b < 110;
}

export async function detectSoldWatermark(imageUrl: string): Promise<boolean> {
  const response = await fetch(imageUrl);
  if (!response.ok) return false;

  const buffer = Buffer.from(await response.arrayBuffer());
  const image = await Jimp.read(buffer);
  const { data, width, height } = image.bitmap;
  const totalPixels = width * height;
  if (totalPixels === 0) return false;

  let redStampPixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (isStampRedPixel(data[i], data[i + 1], data[i + 2])) redStampPixels++;
  }

  return redStampPixels / totalPixels >= RED_STAMP_PIXEL_RATIO_THRESHOLD;
}
