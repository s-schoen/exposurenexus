import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

import type { ClassValue } from "clsx";

// Teach tailwind-merge the custom theme scales in `src/styles.css`, or it reads `text-13` as a color.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["13"],
      shadow: ["raised", "overlay", "peek"],
    },
  },
});

export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs));
}
