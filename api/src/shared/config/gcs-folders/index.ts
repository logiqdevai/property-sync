export const GcsFolders = {
    propertyImages: 'property-images',
    generationRunScreenshots: 'generation-screenshots',
} as const;

export type GcsFolder = (typeof GcsFolders)[keyof typeof GcsFolders];
