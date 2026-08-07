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
          /**
           * Opts the element out of the component's own IntersectionObserver,
           * which otherwise deletes the rendered `<svg>` whenever the icon
           * leaves the viewport and rebuilds it on the way back in. Present or
           * absent is all that is read, so pass `""`.
           */
          noobserver?: string;
        },
        HTMLElement
      >;
    }
  }
}
