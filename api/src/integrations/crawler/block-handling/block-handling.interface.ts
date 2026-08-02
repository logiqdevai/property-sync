export type BlockSignal = 'blocked' | 'challenge';

export type BlockRuleSource =
  | 'title'
  | 'text'
  | 'html'
  | 'path'
  | 'script_content'
  | 'selector';

export interface BlockRule {
  id?: string;
  signal: BlockSignal;
  source: BlockRuleSource;
  pattern: string;
  regex?: boolean;
  flags?: string;
}

export interface BlockHandlingConfig {
  version: 1;
  rules?: BlockRule[];
  wait_timeout_ms?: number;
  min_ready_body_length?: number;
}
