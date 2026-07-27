export type BackgroundPreset = {
  id: string;
  label: string;
  image: string;
  accent: string;
  accentStrong: string;
  surface: string;
  surfaceLight: string;
  overlay: string;
  overlayLight: string;
  position: string;
  contentSide: "left" | "right" | "center";
};

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "court-lines",
    label: "Court lines",
    image: "/backgrounds/abdul-razak-syed-MPm3g2huuLY-unsplash.jpg",
    accent: "#f2b45f",
    accentStrong: "#ffd18a",
    surface: "rgba(8, 18, 18, 0.66)",
    surfaceLight: "rgba(250, 247, 237, 0.76)",
    overlay: "linear-gradient(90deg, rgba(4, 12, 13, 0.92) 0%, rgba(4, 12, 13, 0.68) 48%, rgba(4, 12, 13, 0.18) 100%)",
    overlayLight: "linear-gradient(90deg, rgba(250, 247, 237, 0.68) 0%, rgba(250, 247, 237, 0.38) 48%, rgba(250, 247, 237, 0.08) 100%)",
    position: "center 42%",
    contentSide: "left",
  },
  {
    id: "shuttle-focus",
    label: "Shuttle focus",
    image: "/backgrounds/glen-carrie-imHF66HA3VY-unsplash.jpg",
    accent: "#e3614e",
    accentStrong: "#ff9a78",
    surface: "rgba(12, 10, 10, 0.72)",
    surfaceLight: "rgba(250, 245, 239, 0.78)",
    overlay: "linear-gradient(90deg, rgba(8, 7, 7, 0.94) 0%, rgba(8, 7, 7, 0.72) 47%, rgba(8, 7, 7, 0.22) 100%)",
    overlayLight: "linear-gradient(90deg, rgba(250, 245, 239, 0.72) 0%, rgba(250, 245, 239, 0.42) 47%, rgba(250, 245, 239, 0.1) 100%)",
    position: "center 45%",
    contentSide: "left",
  },
  {
    id: "pair-in-motion",
    label: "Pair in motion",
    image: "/backgrounds/saif71-com-n3HjfZPuT5w-unsplash.jpg",
    accent: "#a7ce91",
    accentStrong: "#d8f0ba",
    surface: "rgba(13, 12, 11, 0.7)",
    surfaceLight: "rgba(250, 247, 237, 0.78)",
    overlay: "linear-gradient(90deg, rgba(8, 8, 8, 0.34) 0%, rgba(8, 8, 8, 0.7) 52%, rgba(8, 8, 8, 0.94) 100%)",
    overlayLight: "linear-gradient(90deg, rgba(250, 247, 237, 0.08) 0%, rgba(250, 247, 237, 0.42) 52%, rgba(250, 247, 237, 0.72) 100%)",
    position: "center 50%",
    contentSide: "right",
  },
  {
    id: "net-blue",
    label: "Net blue",
    image: "/backgrounds/stephan-rothe-VePgmkq3hHI-unsplash.jpg",
    accent: "#65c8dc",
    accentStrong: "#b2eff6",
    surface: "rgba(6, 18, 27, 0.68)",
    surfaceLight: "rgba(241, 249, 250, 0.78)",
    overlay: "linear-gradient(90deg, rgba(4, 12, 20, 0.9) 0%, rgba(4, 12, 20, 0.62) 50%, rgba(4, 12, 20, 0.2) 100%)",
    overlayLight: "linear-gradient(90deg, rgba(241, 249, 250, 0.68) 0%, rgba(241, 249, 250, 0.36) 50%, rgba(241, 249, 250, 0.08) 100%)",
    position: "center 48%",
    contentSide: "left",
  },
  {
    id: "monochrome-flight",
    label: "Monochrome flight",
    image: "/backgrounds/tonmoy-iftekhar-KUxcDOaedrM-unsplash.jpg",
    accent: "#e4ded2",
    accentStrong: "#ffffff",
    surface: "rgba(10, 10, 10, 0.72)",
    surfaceLight: "rgba(246, 244, 239, 0.78)",
    overlay: "linear-gradient(90deg, rgba(5, 5, 5, 0.92) 0%, rgba(5, 5, 5, 0.68) 50%, rgba(5, 5, 5, 0.16) 100%)",
    overlayLight: "linear-gradient(90deg, rgba(246, 244, 239, 0.7) 0%, rgba(246, 244, 239, 0.4) 50%, rgba(246, 244, 239, 0.1) 100%)",
    position: "center 48%",
    contentSide: "left",
  },
];

export const DEFAULT_BACKGROUND_ID = "court-lines";

export function getBackgroundPreset(id: string | null): BackgroundPreset {
  return BACKGROUND_PRESETS.find((preset) => preset.id === id) ?? BACKGROUND_PRESETS[0];
}
