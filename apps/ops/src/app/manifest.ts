import type { MetadataRoute } from "next";

/**
 * The web app manifest — what lets a phone install the ops app.
 *
 * Without this, "Add to Home Screen" on Android makes a bookmark that opens in
 * a browser tab with the address bar taking a fifth of the screen, and Chrome
 * never offers to install at all. With it, the icon on the home screen opens
 * the app full-screen in its own window, like the thing staff will treat it
 * as.
 *
 * There is deliberately NO service worker behind this. An offline shell that
 * shows yesterday's stock list with no way to say it is yesterday's is worse
 * than the browser's own "you are offline" page; the ConnectionBanner says so
 * honestly instead. Offline intake is a separate piece of work, if it is ever
 * wanted.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Take More Ops",
    short_name: "Ops",
    description: "Stock intake, workshop, sales and publishing for Take More Equipment.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#080805",
    theme_color: "#080805",
    icons: [
      { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
      { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
