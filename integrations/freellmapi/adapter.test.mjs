import assert from 'node:assert/strict';
import test from 'node:test';
import { createFreeLlmLayer } from './adapter.js';

const baseEnv = (overrides = {}) => ({
  FREELLMAPI_ENABLED: '1',
  FREELLMAPI_MODEL: 'summary-text-v1',
  ...overrides,
});

function response(status, payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    status,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    }),
  };
}

function goodResponse(content = 'A concise narrative summary.') {
  return response(200, { choices: [{ message: { content } }] });
}

function request(number = 1, overrides = {}) {
  return {
    principalId: 'principal-a',
    idempotencyKey: `idempotency-key-${String(number).padStart(20, '0')}`,
    externalProcessingAuthorized: true,
    prompt: 'Summarize this untrusted narrative.',
    ...overrides,
  };
}

async function codeOf(promise, expected) {
  await assert.rejects(promise, (error) => error?.code === expected);
}

test('status is private, keyless, and has no credential-slot configuration', () => {
  const layer = createFreeLlmLayer({ env: baseEnv(), fetchImpl: async () => goodResponse() });

  assert.deepEqual(layer.status(), {
    enabled: true,
    keyless: true,
    configured: true,
    source: 'freellmapi',
    requiredCount: 0,
  });
  assert.deepEqual(Object.keys(layer).sort(), ['complete', 'status']);
  assert.doesNotMatch(JSON.stringify(layer.status()), /credential|token|secret|configuredSlots/i);
});

test('disabled default-local job makes no request even if a remote URL is configured', async () => {
  let calls = 0;
  const layer = createFreeLlmLayer({
    env: baseEnv({ FREELLMAPI_ENABLED: '0', FREELLMAPI_URL: 'https://not-local.invalid/v1' }),
    fetchImpl: async () => {
      calls += 1;
      return goodResponse();
    },
  });

  assert.equal(layer.status().configured, false);
  await codeOf(layer.complete(request()), 'DISABLED');
  assert.equal(calls, 0);
});

test('does not read any key-named environment property', async () => {
  const env = new Proxy(baseEnv(), {
    get(target, property, receiver) {
      if (typeof property === 'string' && /key/i.test(property)) {
        throw new Error(`unexpected key environment read: ${property}`);
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const layer = createFreeLlmLayer({ env, fetchImpl: async () => goodResponse() });

  const result = await layer.complete(request());
  assert.equal(result.text, 'A concise narrative summary.');
});

test('requires explicit external-processing authorization before input or network handling', async () => {
  let calls = 0;
  const layer = createFreeLlmLayer({
    env: baseEnv(),
    fetchImpl: async () => {
      calls += 1;
      return goodResponse();
    },
  });

  await codeOf(layer.complete(request(1, { externalProcessingAuthorized: false })), 'CONSENT_REQUIRED');
  assert.equal(calls, 0);
});

test('sends a bounded text-only local-gateway request without Authorization or other credential headers', async () => {
  const calls = [];
  const layer = createFreeLlmLayer({
    env: baseEnv(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return goodResponse('Summary only.');
    },
  });

  const result = await layer.complete(request());
  assert.equal(result.text, 'Summary only.');
  assert.equal(result.model, 'summary-text-v1');
  assert.match(result.jobHash, /^[a-f0-9]{64}$/);
  assert.match(result.warning, /^Untrusted optional narrative/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:3001/v1/chat/completions');
  assert.equal(calls[0].options.redirect, 'error');
  assert.deepEqual(calls[0].options.headers, { 'content-type': 'application/json' });
  assert.equal('authorization' in calls[0].options.headers, false);
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'stream', 'temperature']);
  assert.equal(body.max_tokens, 512);
  assert.equal(body.temperature, 0.2);
  assert.equal(body.stream, false);
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /untrusted user narrative/i);
  assert.match(body.messages[1].content, /^Untrusted user narrative:/);
});

test('principal rate limit rejects the third request in a minute without a network call', async () => {
  let current = 1_000_000;
  let calls = 0;
  const layer = createFreeLlmLayer({
    env: baseEnv(),
    clock: () => current,
    fetchImpl: async () => {
      calls += 1;
      return goodResponse();
    },
  });

  await layer.complete(request(1));
  await layer.complete(request(2));
  await codeOf(layer.complete(request(3)), 'RATE_LIMITED');
  assert.equal(calls, 2);
  current += 60_001;
  await layer.complete(request(4));
  assert.equal(calls, 3);
});

test('adapter-wide hourly quota is enforced across separate principals', async () => {
  let current = 2_000_000;
  let calls = 0;
  const layer = createFreeLlmLayer({
    env: baseEnv(),
    clock: () => current,
    fetchImpl: async () => {
      calls += 1;
      return goodResponse();
    },
  });

  for (let index = 1; index <= 30; index += 1) {
    await layer.complete(request(index, { principalId: `principal-${index}` }));
    current += 60_001;
  }
  await codeOf(layer.complete(request(31, { principalId: 'principal-31' })), 'RATE_LIMITED');
  assert.equal(calls, 30);
});

test('replay reservations are bounded, expire only by TTL, and never clear quota state', async () => {
  let current = 3_000_000;
  let calls = 0;
  const layer = createFreeLlmLayer({
    env: baseEnv(),
    clock: () => current,
    fetchImpl: async () => {
      calls += 1;
      return goodResponse();
    },
  });

  await layer.complete(request(1));
  for (let index = 2; index <= 10; index += 1) {
    current += 60_001;
    await layer.complete(request(index, { principalId: `principal-${index}` }));
  }
  await codeOf(layer.complete(request(1)), 'REPLAY');
  assert.equal(calls, 10);
  current += 10 * 60_000;
  await layer.complete(request(1));
  assert.equal(calls, 11);
});

test('remote, DNS, authenticated, query, fragment, and fusion configuration is rejected without network access', async () => {
  const configurations = [
    { FREELLMAPI_URL: 'https://127.0.0.1/v1' },
    { FREELLMAPI_URL: 'http://localhost:3001/v1' },
    { FREELLMAPI_URL: 'http://example.test/v1' },
    { FREELLMAPI_URL: 'http://user:pass@127.0.0.1:3001/v1' },
    { FREELLMAPI_URL: 'http://127.0.0.1:3001/v1?target=elsewhere' },
    { FREELLMAPI_URL: 'http://127.0.0.1:3001/v1#target' },
    { FREELLMAPI_MODEL: 'fusion-agent-v1' },
  ];

  for (const override of configurations) {
    let calls = 0;
    const layer = createFreeLlmLayer({
      env: baseEnv(override),
      fetchImpl: async () => {
        calls += 1;
        return goodResponse();
      },
    });
    await codeOf(layer.complete(request()), 'NOT_CONFIGURED');
    assert.equal(calls, 0);
  }
});

test('rejects oversized or unsafe response payloads and sanitizes upstream failures', async () => {
  const oversized = 'x'.repeat(65_537);
  const oversize = createFreeLlmLayer({ env: baseEnv(), fetchImpl: async () => response(200, oversized) });
  await codeOf(oversize.complete(request(1)), 'INVALID_RESPONSE');

  const tools = createFreeLlmLayer({
    env: baseEnv(),
    fetchImpl: async () => response(200, {
      choices: [{ message: { content: 'No.', tool_calls: [{ type: 'function' }] } }],
    }),
  });
  await codeOf(tools.complete(request(2)), 'INVALID_RESPONSE');

  const failure = createFreeLlmLayer({
    env: baseEnv(),
    fetchImpl: async () => {
      throw new Error('local provider internal detail must not reach callers');
    },
  });
  await assert.rejects(failure.complete(request(3)), (error) => (
    error.code === 'UPSTREAM_UNAVAILABLE'
    && !error.message.includes('internal detail')
  ));
});

test('429 applies a global cooldown and does not make an automatic retry', async () => {
  let current = 4_000_000;
  let calls = 0;
  const layer = createFreeLlmLayer({
    env: baseEnv(),
    clock: () => current,
    fetchImpl: async () => {
      calls += 1;
      return response(429, { error: { message: 'rate limited' } });
    },
  });

  await codeOf(layer.complete(request(1)), 'RATE_LIMITED');
  assert.equal(calls, 1);
  await codeOf(layer.complete(request(2, { principalId: 'different-principal' })), 'RATE_LIMITED');
  assert.equal(calls, 1);
  current += 30_001;
  await codeOf(layer.complete(request(3, { principalId: 'third-principal' })), 'RATE_LIMITED');
  assert.equal(calls, 2);
});

test('refuses a body with only an unbounded text reader without calling it', async () => {
  let reads = 0;
  const layer = createFreeLlmLayer({ env: baseEnv(), fetchImpl: async () => ({ status: 200, text: async () => { reads += 1; return 'x'.repeat(1_000_000); } }) });
  await codeOf(layer.complete(request()), 'INVALID_RESPONSE');
  assert.equal(reads, 0);
});

test('sanitizes recognized error codes instead of exposing upstream messages', async () => {
  const error = Object.assign(new Error('private-upstream-detail'), { code: 'INVALID_RESPONSE' });
  const layer = createFreeLlmLayer({ env: baseEnv(), fetchImpl: async () => { throw error; } });
  await assert.rejects(layer.complete(request()), (failure) => failure.code === 'INVALID_RESPONSE' && !failure.message.includes('private-upstream-detail'));
});
