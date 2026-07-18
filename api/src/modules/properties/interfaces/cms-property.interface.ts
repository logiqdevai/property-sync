export interface CmsPropertyFieldEntry {
  id: number;
  value: string | number;
}

export interface CmsPropertyMetadata {
  guarantee?: string | null;
  stamp?: string | null;
  inc_type?: number | null;
  inc_value?: string | null;
  inc_period?: number | null;
  inc_2years?: string | null;
  contract_period?: string | null;
  terms?: string | null;
  has_keys?: string | null;
}
