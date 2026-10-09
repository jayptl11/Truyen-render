import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const local = resolve('.venv-vieneu', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = process.env.VIENEU_PYTHON_BIN || (existsSync(local) ? local : 'python');
const child = spawn(python, ['-m', 'uvicorn', 'services.vieneu.app:app', '--host', process.env.VIENEU_HOST || '127.0.0.1', '--port', process.env.VIENEU_PORT || '8000', '--workers', '1'], { stdio: 'inherit' });
child.on('error', () => { console.error('Không chạy được Python VieNeu. Xem services/vieneu/README.md để cài môi trường.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
