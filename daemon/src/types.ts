export type SourceId = 'mail' | 'whatsapp' | 'calendar';

export interface SourceItem {
  source: SourceId;
  ref: string;
  at: number;
  from: string;
  title: string;
  text: string;
  unread?: boolean;
  url?: string;
}

export interface SourceResult {
  source: SourceId;
  ok: boolean;
  error?: string;
  items: SourceItem[];
}

export interface Insight {
  id: string;
  source: SourceId | 'trinity';
  priority: 1 | 2 | 3;
  title: string;
  detail: string;
  from?: string;
  chat?: string;
  group?: boolean;
  ref?: string;
  url?: string;
}

export interface Upcoming {
  id: string;
  what: string;
  when: string;
  whenText: string;
  who?: string;
  chat?: string;
  source: SourceId;
  ref?: string;
  addedAt: number;
  updatedAt: number;
}

export interface Digest {
  generatedAt: number;
  hash: string;
  headline: string;
  summary: string;
  insights: Insight[];
  upcoming?: Upcoming[];
  sources: { source: SourceId; ok: boolean; error?: string; count: number }[];
  usage?: { model: string; tokensIn: number; tokensOut: number };
}
