export type CompletionRequest = { principalId: string; idempotencyKey: string; externalProcessingAuthorized: boolean; prompt: string };
export type CompletionResult = { text: string; model: string; warning: string; jobHash?: string };
export function createFreeLlmLayer(options?: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch; clock?: () => number }): {
  status(): { enabled: boolean; keyless: boolean; configured?: boolean; [key: string]: unknown };
  complete(request: CompletionRequest): Promise<CompletionResult>;
};
