// Global ambient declarations for the Wordsless app.
// Lets TypeScript accept CSS module imports and the global stylesheet side-effect import
// without needing per-file `// @ts-expect-error` comments.

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.css' {
  const content: { readonly [key: string]: string };
  export default content;
}
