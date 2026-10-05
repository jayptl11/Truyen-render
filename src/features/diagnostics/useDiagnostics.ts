import { useEffect, useState } from 'react';
export interface DiagnosticLog { type: 'log' | 'error' | 'warn' | 'info'; message: string; timestamp: string }
function redact(value: string): string {
  return value.replace(/([?&](?:key|api_key|token)=)[^&\s]+/gi, '$1[ẩn]').replace(/Bearer\s+[^\s]+/gi, 'Bearer [ẩn]');
}
export function useDiagnostics() {
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);
  useEffect(() => {
    const add = (type: DiagnosticLog['type'], ...args: unknown[]) => {
      const message = args.map(argument => {
        if (argument instanceof Error) return `${argument.name}: ${argument.message}`;
        try { return typeof argument === 'object' ? JSON.stringify(argument) : String(argument); } catch { return '[Không hiển thị được dữ liệu]'; }
      }).join(' ');
      setLogs(previous => [...previous.slice(-99), { type, message: redact(message), timestamp: new Date().toLocaleTimeString('vi-VN') }]);
    };
    const methods = ['log', 'error', 'warn', 'info'] as const;
    const originals = { log: console.log, error: console.error, warn: console.warn, info: console.info };
    methods.forEach(type => { console[type] = (...args: unknown[]) => { originals[type](...args); add(type, ...args); }; });
    const onError = (event: ErrorEvent) => add('error', event.message);
    const onRejection = (event: PromiseRejectionEvent) => add('error', event.reason);
    window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onRejection);
    return () => { methods.forEach(type => { console[type] = originals[type]; }); window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
  }, []);
  return { logs, clear: () => setLogs([]) };
}
