import { readFileSync } from 'fs';
import { join } from 'path';
import { EstateWebLocation } from '../interfaces/estateweb-location.interface';

function loadLocations(): EstateWebLocation[] {
  const raw = readFileSync(
    join(__dirname, 'estateweb-locations.data.json'),
    'utf8',
  );
  return JSON.parse(raw) as EstateWebLocation[];
}

export const ESTATEWEB_LOCATIONS: EstateWebLocation[] = loadLocations();
