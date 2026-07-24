export interface DewatermarkCreditInfoData {
  available_credit: number;
  user_id: string;
}

export interface DewatermarkCreditInfoResponse {
  status: string;
  data: DewatermarkCreditInfoData;
}

export interface DewatermarkCreditInfo {
  available_credit: number;
  user_id: string;
}
