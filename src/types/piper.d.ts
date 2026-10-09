declare module '*piper-o91UDS6e.js' {
  export function createPiperPhonemize(options: {
    wasmBinary: ArrayBuffer;
    getPreloadedPackage: () => ArrayBuffer;
    print: (line: string) => void;
    printErr: (line: string) => void;
    locateFile: (file: string) => string;
  }): Promise<{ callMain: (args: string[]) => number }>;
}
