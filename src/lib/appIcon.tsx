import { ImageResponse } from "next/og";

/** The app icon, drawn at any size: a copper tile with an italic "A". Used for the home screen and the manifest. */
export function appIcon(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ce4c3b",
          color: "#ffffff",
          fontSize: size * 0.62,
          fontStyle: "italic",
          fontWeight: 700,
          fontFamily: "serif",
        }}
      >
        A
      </div>
    ),
    { width: size, height: size }
  );
}
