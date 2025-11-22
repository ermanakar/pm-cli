export interface PMXConfig {
  model: string;
}

export function loadPMXConfig(): PMXConfig {
  return {
    model: process.env.PMX_MODEL || "gpt-4o-mini",
  };
}
