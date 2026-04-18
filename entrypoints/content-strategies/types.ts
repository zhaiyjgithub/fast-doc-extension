export type SearchTarget = {
  doc: Document;
  path: string;
  sourceUrl: string;
};

export type ExtractDemographicsData = {
  profileId: string;
  selectorMatched: string;
  demographicsText: string;
  sourceUrl?: string;
  sourcePath?: string;
  signalSummary?: {
    score: number;
    matched: string[];
    missing: string[];
  };
  textPreview?: string;
};

export type ExtractDemographicsResponse =
  | { ok: true; data: ExtractDemographicsData }
  | { ok: false; error: string };

export type SyncChiefComplaintPayload = {
  chiefComplaintText: string;
  presentIllnessText: string;
  autoSave?: boolean;
  debug?: boolean;
  requestId?: string;
};

export type SyncChiefComplaintResponse =
  | {
      ok: true;
      strategy?: string;
      sourceUrl?: string;
      sourcePath?: string;
      note?: string;
      diagnostics?: unknown;
    }
  | { ok: false; error: string };
