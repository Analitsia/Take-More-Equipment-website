import type { DetailedHTMLProps, HTMLAttributes } from "react";

// The template uses the <iconify-icon> web component. Declare it for JSX.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "iconify-icon": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          icon: string;
          width?: string | number;
          height?: string | number;
        },
        HTMLElement
      >;
    }
  }
}
