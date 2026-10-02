declare module '*.css';

declare namespace svelteHTML {
  interface HTMLAttributes<T> {
    'cy-data'?: string;
  }
}