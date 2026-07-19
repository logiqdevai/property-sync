import Anthropic from '@anthropic-ai/sdk';
import { ComputerActionType } from 'generated/prisma';

type StoredStepLike = {
  step_index: number;
  action_type: ComputerActionType;
  action_payload: unknown;
  model_reasoning: string | null;
};

function hasImageContent(message: Anthropic.MessageParam): boolean {
  return (
    message.role === 'user' &&
    Array.isArray(message.content) &&
    message.content.some((block) => block.type === 'image')
  );
}

function summarizeStep(step: StoredStepLike): string {
  const action = step.action_type.toLowerCase().replace(/_/g, ' ');
  const payload = (step.action_payload ?? {}) as Record<string, unknown>;
  const details = [
    typeof payload.selector === 'string'
      ? `selector: ${payload.selector}`
      : null,
    typeof payload.url === 'string' ? `url: ${payload.url}` : null,
    typeof payload.text === 'string' ? `text: ${payload.text}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const reasoning = step.model_reasoning ? ` — ${step.model_reasoning}` : '';
  return `Step ${step.step_index}: ${action}${details ? ` (${details})` : ''}${reasoning}`;
}

export function buildStepsSummaryText(steps: StoredStepLike[]): string {
  if (steps.length === 0) {
    return '';
  }

  return `Previous session (${steps.length} steps):\n${steps.map(summarizeStep).join('\n')}`;
}

export function extractResumeUrl(
  steps: StoredStepLike[],
  fallback: string,
): string {
  for (let i = steps.length - 1; i >= 0; i--) {
    const payload = (steps[i].action_payload ?? {}) as Record<string, unknown>;
    if (typeof payload.url === 'string' && payload.url.startsWith('http')) {
      return payload.url;
    }
  }

  return fallback;
}

function summarizeTurn(
  userMessage: Anthropic.MessageParam,
  assistantMessage?: Anthropic.MessageParam,
): string {
  const hint =
    typeof userMessage.content === 'string'
      ? userMessage.content
      : userMessage.content.find(
            (block) => block.type === 'text' && 'text' in block,
          )?.type === 'text'
        ? (
            userMessage.content.find((block) => block.type === 'text') as {
              text: string;
            }
          ).text
        : 'Screenshot step';

  const assistantText =
    assistantMessage && typeof assistantMessage.content === 'string'
      ? assistantMessage.content.slice(0, 500)
      : '';

  return assistantText ? `${hint}\nAssistant: ${assistantText}` : hint;
}

export function compactImageMessages(
  messages: Anthropic.MessageParam[],
  maxImageTurns: number,
): Anthropic.MessageParam[] {
  if (maxImageTurns <= 0 || messages.length === 0) {
    return messages;
  }

  const prefix: Anthropic.MessageParam[] = [];
  const imageTurns: {
    user: Anthropic.MessageParam;
    assistant?: Anthropic.MessageParam;
  }[] = [];

  let index = 0;
  while (index < messages.length) {
    const message = messages[index];

    if (hasImageContent(message)) {
      const assistant =
        messages[index + 1]?.role === 'assistant'
          ? messages[index + 1]
          : undefined;
      imageTurns.push({ user: message, assistant });
      index += assistant ? 2 : 1;
      continue;
    }

    prefix.push(message);
    index += 1;
  }

  if (imageTurns.length <= maxImageTurns) {
    return messages;
  }

  const droppedTurns = imageTurns.slice(0, imageTurns.length - maxImageTurns);
  const keptTurns = imageTurns.slice(-maxImageTurns);
  const compactedSummary = [
    'Earlier screenshot steps were compacted to stay within API limits:',
    ...droppedTurns.map((turn) => summarizeTurn(turn.user, turn.assistant)),
  ].join('\n');

  return [
    ...prefix,
    { role: 'user', content: compactedSummary },
    ...keptTurns.flatMap((turn) => [
      turn.user,
      ...(turn.assistant ? [turn.assistant] : []),
    ]),
  ];
}
