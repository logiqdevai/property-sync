import { ComputerActionType } from 'generated/prisma';
import { GenerationAction } from '../interfaces/computer-use.interface';

export function mapActionType(
  action: GenerationAction['action'],
): ComputerActionType {
  return ComputerActionType[
    action.toUpperCase() as keyof typeof ComputerActionType
  ];
}

export function unmapActionType(
  actionType: ComputerActionType,
): GenerationAction['action'] {
  const key = actionType.toLowerCase() as GenerationAction['action'];
  if (
    key === 'click' ||
    key === 'scroll_down' ||
    key === 'scroll_up' ||
    key === 'type' ||
    key === 'navigate' ||
    key === 'go_back' ||
    key === 'close_tab' ||
    key === 'wait' ||
    key === 'done'
  ) {
    return key;
  }
  throw new Error(
    `Unsupported action type for generation replay: ${actionType}`,
  );
}

export function stepToGenerationAction(
  actionType: ComputerActionType,
  actionPayload: Record<string, unknown>,
): GenerationAction {
  const action = unmapActionType(actionType);
  const payload = actionPayload ?? {};

  if (action === 'done') {
    return {
      reasoning:
        typeof payload.reasoning === 'string' ? payload.reasoning : undefined,
      action: 'done',
      config: payload.config as Record<string, unknown>,
    };
  }

  return {
    reasoning:
      typeof payload.reasoning === 'string' ? payload.reasoning : undefined,
    action,
    selector:
      typeof payload.selector === 'string' ? payload.selector : undefined,
    text: typeof payload.text === 'string' ? payload.text : undefined,
    url: typeof payload.url === 'string' ? payload.url : undefined,
  };
}

export function stepToAssistantText(
  actionType: ComputerActionType,
  actionPayload: Record<string, unknown>,
  modelReasoning: string | null,
): string {
  const action = stepToGenerationAction(actionType, actionPayload);
  if (modelReasoning) {
    action.reasoning = modelReasoning.replace(
      /\s*\[VERIFICATION FAILED\]\s*$/,
      '',
    );
  }

  if (action.action === 'done') {
    return JSON.stringify({
      reasoning: action.reasoning,
      action: 'done',
      config: action.config,
    });
  }

  return JSON.stringify({
    reasoning: action.reasoning,
    action: action.action,
    ...(action.selector ? { selector: action.selector } : {}),
    ...(action.text ? { text: action.text } : {}),
    ...(action.url ? { url: action.url } : {}),
  });
}
