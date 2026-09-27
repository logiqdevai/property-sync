export const GcsFolders = {
  propertyImages: 'property-images',
  diagnostics: 'diagnostics',
  sourcePropertyHtml: 'source-property-html',
} as const;

export type GcsFolder = (typeof GcsFolders)[keyof typeof GcsFolders];
