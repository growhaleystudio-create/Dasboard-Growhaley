/**
 * image-detection.ts — Detects image requirements from prompts and visual layers
 */

/**
 * Returns true if the prompt explicitly mentions images, photos, or visual content.
 */
export function promptExplicitlyRequestsImages(prompt: string): boolean {
  return /\b(gambar|image|foto|photo|ilustrasi|illustration|visual|visualisasi)\b/i.test(prompt);
}

/**
 * Returns true if the prompt implies a visual-led deck (product, promo, aesthetic focus).
 */
export function promptRequestsVisualLedDeck(prompt: string): boolean {
  return (
    promptExplicitlyRequestsImages(prompt) ||
    /\b(produk|product|promo|katalog|catalog|showcase|etalase|mood|aesthetic|estetik|lampu|furniture|interior|studio|fashion|outfit|menu|food|makanan|properti|property|real estate)\b/i.test(
      prompt,
    )
  );
}

/**
 * Returns true if the visual layer specifically requires generated artwork.
 */
export function visualLayerNeedsGeneratedArtwork(visualLayer: string | undefined): boolean {
  if (!visualLayer) return false;
  const normalized = visualLayer.toLowerCase();
  return (
    normalized.includes('generated') ||
    normalized.includes('illustration') ||
    normalized.includes('abstract')
  );
}
