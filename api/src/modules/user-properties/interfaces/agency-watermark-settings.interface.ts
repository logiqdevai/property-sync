export interface AgencyWatermarkSettings {
  source_agency_id: string;
  user_id: string;
  remove_watermark: boolean;
  watermark_image_count: number;
  max_image_count: number | null;
}
