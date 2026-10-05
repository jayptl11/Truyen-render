interface EspeakModule {
  FS: { writeFile: (path: string, text: string) => void; readFile: (path: string) => Uint8Array };
}
declare module 'espeak-ng' {
  export default function createEspeak(options: {
    wasmBinary: ArrayBuffer; arguments: string[]; preRun: ((instance: EspeakModule) => void)[];
    print: (text: string) => void; printErr: (text: string) => void;
  }): Promise<EspeakModule>;
}
