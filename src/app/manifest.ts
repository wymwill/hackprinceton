import type { MetadataRoute } from "next";

/** Lets phones add Alea to the home screen and open it full screen, like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Alea",
    short_name: "Alea",
    description: "Bet with your friends on real life. No money: tokens or points, a Bookie who sets the odds, and dares that get done.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1c1b1f",
    theme_color: "#1c1b1f",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
