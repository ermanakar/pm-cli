export interface InvestigationConfig {
  maxTurns: number;
  maxTimeMs: number;
}

export interface InvestigationObjective {
  text: string;
}

export interface EvidenceItem {
  path: string;
  summary: string;
  snippet?: string;
}

export interface InvestigationResult {
  objective: InvestigationObjective;
  summary: string;
  details: string;
  evidence: EvidenceItem[];
}
