export interface CrmClientNotesSyncJobData {
  job_log_id: string;
  user_id: string;
  user_property_id: string;
  total: number;
}

export type CrmClientNotesSyncItemStatus = 'updated' | 'failed';

export interface CrmClientNotesSyncItemResult {
  user_property_id: string;
  status: CrmClientNotesSyncItemStatus;
  error?: string;
}

export interface CrmClientNotesSyncJobResult {
  total: number;
  processed: number;
  updated: number;
  failed: number;
  items: CrmClientNotesSyncItemResult[];
  logs?: string[];
}
