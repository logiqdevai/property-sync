export const GcsFolders = {
  propertyImages: 'property-images',
  diagnostics: 'diagnostics',
  sourcePropertyHtml: 'source-property-html',
  // Installers of the desktop crawler app (desktop/) + latest.json, published by
  // scripts/publish-desktop-crawler.ts.
  desktopCrawler: 'desktop-crawler',
} as const;

export type GcsFolder = (typeof GcsFolders)[keyof typeof GcsFolders];
