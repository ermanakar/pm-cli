export interface ScribeConfig {
  maxTurns: number;
}

export interface FeatureRequest {
  title: string;
  description: string;
}

export interface ScribeResult {
  path: string;
  summary: string;
}
