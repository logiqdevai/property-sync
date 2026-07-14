export type GenerationActionType =
  | 'click'
  | 'scroll_down'
  | 'scroll_up'
  | 'type'
  | 'navigate'
  | 'go_back'
  | 'close_tab'
  | 'wait'
  | 'done';

export interface GenerationAction {
  reasoning?: string;
  action: GenerationActionType;
  selector?: string;
  text?: string;
  url?: string;
  config?: Record<string, unknown>;
}

export interface ComputerUseStepResult {
  rawText: string;
  usage?: { input_tokens: number; output_tokens: number };
}
