import { addons } from "storybook/manager-api";
import { create } from "storybook/theming/create";

const gonTheme = create({
  base: "dark",
  brandTitle: "GON — Game Of Nurture",
  brandUrl: "./",
  colorPrimary: "#12b981",
  colorSecondary: "#ffb703",
  appBg: "#07111f",
  appContentBg: "#0a1a2e",
  appBorderColor: "rgba(168, 189, 210, 0.22)",
  appBorderRadius: 14,
  textColor: "#f4f8ff",
  textInverseColor: "#07111f",
  barTextColor: "#a8bdd2",
  barHoverColor: "#6ee7b7",
  barSelectedColor: "#ffb703",
  barBg: "#07111f",
  inputBg: "#0e2237",
  inputBorder: "rgba(168, 189, 210, 0.28)",
  inputTextColor: "#f4f8ff",
  inputBorderRadius: 10,
  fontBase: '"Be Vietnam Pro", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontCode: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
});

addons.setConfig({
  theme: gonTheme,
  sidebar: {
    showRoots: true,
  },
});
