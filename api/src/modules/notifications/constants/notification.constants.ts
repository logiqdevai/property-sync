export const PROPERTY_REMOVAL_SPIKE_ABSOLUTE_THRESHOLD = 10;

export const PROPERTY_REMOVAL_SPIKE_RATIO_THRESHOLD = 0.3;

export const CRAWL_REMOVAL_COVERAGE_RATIO_THRESHOLD = 0.7;

export const CRAWL_REMOVAL_COVERAGE_MIN_BASELINE = 5;

// Lowered from 0.5 after lafazanihomes lost 37% of its live listings to a bot
// challenge on 2026-09-28 and the guard let it through.
export const CRAWL_REMOVAL_MASS_RATIO_THRESHOLD = 0.2;
