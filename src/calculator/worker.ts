import { calculateCombat } from "../combat.js";
self.onmessage = (event: MessageEvent) => {
  try {
    self.postMessage({ result: calculateCombat(event.data) });
  } catch (e) {
    const error = e as {
      issues?: { path: (string | number)[]; message: string }[];
      message?: string;
    };
    self.postMessage({
      error: error.issues
        ? error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("\n")
        : (error.message ?? "Calculation failed."),
    });
  }
};
