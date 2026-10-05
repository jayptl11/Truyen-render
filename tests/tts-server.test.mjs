import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const core = buildSync({ entryPoints: ['server/tts.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
function load(mode) {
  const children = [];
  const spawn = (python, args) => {
    const child = new EventEmitter(); children.push(child);
    child.python = python; child.args = args; child.stdout = new EventEmitter(); child.stderr = { resume() {} };
    child.stdin = new EventEmitter(); child.kill = () => { child.killed = true; };
    child.stdin.end = raw => {
      child.request = JSON.parse(raw);
      if (mode === 'stalled') return;
      queueMicrotask(() => {
        const result = mode === 'error' ? { status: 504, error: 'Edge phản hồi quá lâu.' }
          : child.request.action === 'voices' ? { voices: [{ id: 'vi-VN-HoaiMyNeural', gender: 'female', language: 'vi-VN', name: 'Hoài My' }] }
          : { audio: Buffer.from('audio').toString('base64') };
        child.stdout.emit('data', Buffer.from(JSON.stringify(result))); child.emit('close', 0);
      });
    };
    return child;
  };
  const module = { exports: {} };
  runInNewContext(core, { module, exports: module.exports, Buffer, Date, process: { env: { PYTHON_BIN: '/test/python' } }, setTimeout, clearTimeout,
    require: name => name === 'node:child_process' ? { spawn } : name === 'node:fs' ? { existsSync: () => false } : require(name) });
  return { service: module.exports, children };
}
test('Vite bridge invokes Python without shell interpolation, caches voices and decodes audio', async () => {
  const { service, children } = load();
  const voices = await service.edgeVoices(); assert.equal(voices[0].gender, 'female');
  await service.edgeVoices(); assert.equal(children.length, 1);
  const input = { text: 'Nội dung $(never-run)', voice: 'vi-VN-HoaiMyNeural', language: 'vi-VN' };
  assert.equal((await service.edgeAudio(input)).toString(), 'audio');
  assert.equal(children[1].python, '/test/python');
  assert.equal(JSON.stringify(children[1].args), JSON.stringify(['-m', 'server.tts_cli']));
  assert.equal(children[1].request.input.text, input.text);
});
test('Vite bridge kills Python on cancellation and preserves structured upstream errors', async () => {
  const { service, children } = load('stalled'); const controller = new AbortController();
  const task = service.edgeAudio({}, controller.signal); controller.abort();
  await assert.rejects(task, error => error.status === 499); assert.equal(children[0].killed, true);
  await assert.rejects(load('error').service.edgeVoices(), error => error.status === 504 && /quá lâu/.test(error.message));
});
