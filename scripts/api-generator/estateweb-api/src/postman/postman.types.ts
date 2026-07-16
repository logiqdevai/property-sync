export interface PostmanHeader {
  key: string;
  value: string;
  type?: "text";
}

export interface PostmanQueryParam {
  key: string;
  value: string;
}

export interface PostmanUrl {
  raw: string;
  host: string[];
  path: string[];
  query?: PostmanQueryParam[];
}

export interface PostmanFormDataField {
  key: string;
  value?: string;
  type: "text" | "file";
  src?: string;
}

export interface PostmanUrlEncodedField {
  key: string;
  value: string;
}

export interface PostmanBody {
  mode: "raw" | "formdata" | "urlencoded";
  raw?: string;
  options?: { raw: { language: "json" | "text" | "html" | "xml" } };
  formdata?: PostmanFormDataField[];
  urlencoded?: PostmanUrlEncodedField[];
}

export interface PostmanResponse {
  name: string;
  status: string;
  code: number;
  header: PostmanHeader[];
  body: string;
  _postman_previewlanguage?: "json" | "text" | "html" | "xml";
}

export interface PostmanRequest {
  method: string;
  header: PostmanHeader[];
  body?: PostmanBody;
  url: PostmanUrl;
  description?: string;
}

export interface PostmanRequestItem {
  name: string;
  request: PostmanRequest;
  response?: PostmanResponse[];
}

export interface PostmanFolder {
  name: string;
  item: PostmanItem[];
}

export type PostmanItem = PostmanFolder | PostmanRequestItem;

export interface PostmanVariable {
  key: string;
  value: string;
}

export interface PostmanCollection {
  info: {
    name: string;
    description: string;
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
  };
  variable: PostmanVariable[];
  item: PostmanItem[];
}
