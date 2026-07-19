export const GcsFolders = {
  propertyImages: 'property-images',
  generationRunScreenshots: 'generation-screenshots',
  diagnostics: 'diagnostics',
  sourcePropertyHtml: 'source-property-html',
} as const;

export type GcsFolder = (typeof GcsFolders)[keyof typeof GcsFolders];
