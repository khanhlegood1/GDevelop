import { useEffect, type ReactNode } from "react";
import type { Preview } from "@storybook/nextjs-vite";
import "../src/app/globals.css";
import "./gon-storybook.css";

function GonPreviewFrame({ children }: { children: ReactNode }) {
  useEffect(() => {
    const previousLang = document.documentElement.lang;
    const previousTitle = document.title;

    document.documentElement.lang = "vi";
    document.title = "GON Storybook — Game Of Nurture";
    document.body.dataset.gonStorybook = "true";

    return () => {
      document.documentElement.lang = previousLang;
      document.title = previousTitle;
      delete document.body.dataset.gonStorybook;
    };
  }, []);

  return <div className="sb-gon-root">{children}</div>;
}

const preview: Preview = {
  decorators: [
    (Story) => (
      <GonPreviewFrame>
        <Story />
      </GonPreviewFrame>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "GON midnight",
      values: [
        { name: "GON midnight", value: "#07111f" },
        { name: "GON paper", value: "#f5f8fc" },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        order: ["GON", "Screens", "Design System"],
      },
    },
    a11y: {
      test: "todo",
    },
  },
};

export default preview;
