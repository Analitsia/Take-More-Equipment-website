/**
 * @takemore/ui — brand tokens and shared primitives.
 *
 * The form kit (input, textarea, select, combobox, file drop, toast) lands here
 * when apps/ops needs it. For now this package exists to own the Tailwind
 * preset, so both apps read the palette from one file.
 */

export { default as tailwindPreset } from "./tailwind-preset.ts";
export * from "./tokens.ts";
export * from "./form.tsx";
export * from "./status.tsx";
export { default as Turnstile } from "./turnstile.tsx";
