// Images imported from assets/ are inlined by esbuild as data: URLs (see scripts/build.mjs).
declare module '*.png' {
  const dataUrl: string;
  export default dataUrl;
}
