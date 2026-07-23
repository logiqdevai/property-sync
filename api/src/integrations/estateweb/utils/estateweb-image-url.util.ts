export const ESTATEWEB_IMAGE_SERVER = 'https://images.estateweb.gr/';

export function buildEstateWebImageUrl(params: {
  path: string;
  filename: string;
  agentId?: number | null;
}): string {
  const filename = params.filename.replace(/^\/+/, '');
  const rawPath = params.path.replace(/^\/+/, '').replace(/\/+$/, '');

  if (rawPath.includes('/')) {
    if (rawPath.endsWith(filename)) {
      return `${ESTATEWEB_IMAGE_SERVER}${rawPath}`;
    }
    return `${ESTATEWEB_IMAGE_SERVER}${rawPath}/${filename}`;
  }

  const folder =
    rawPath ||
    (params.agentId != null && Number.isFinite(params.agentId)
      ? String(params.agentId)
      : '');

  if (!folder) {
    return `${ESTATEWEB_IMAGE_SERVER}${filename}`;
  }

  return `${ESTATEWEB_IMAGE_SERVER}${folder}/${filename}`;
}
