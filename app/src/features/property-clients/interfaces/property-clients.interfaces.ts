export interface PropertyClient {
  id: string;
  user_property_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  shown_at: string;
  delisted_at: string | null;
  created_at: string;
}

export interface PropertyClientPayload {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  shown_at?: string;
}

export interface KnownClient {
  name: string;
  phone: string | null;
  email: string | null;
}

export interface DelistedPropertyAlert {
  user_property_id: string;
  title: string;
  status: string;
  internal_id: string | null;
  delisted_at: string | null;
  acknowledged?: boolean;
  clients: {
    id: string;
    name: string;
    phone: string | null;
    notes: string | null;
    shown_at: string;
  }[];
}
