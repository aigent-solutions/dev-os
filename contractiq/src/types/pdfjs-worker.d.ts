// pdfjs-dist ships no declaration for its worker entry; extract-text.ts only hands the module to pdf.js.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
