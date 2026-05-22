// Shared types between background, content scripts, and the panel.

export type RuleSeverity = 'critical' | 'issue' | 'warn';

export interface Rule {
  id: string;
  name: string;
  description: string;
  severity: RuleSeverity;
}

export interface Flag {
  ruleId: string;
  ruleName: string;
  severity: RuleSeverity;
  span: { start: number; end: number } | null;
  quote: string;
  suggestion: string;
  why: string;
}

export interface RecipientHints {
  toEmail: string | null;
  toName: string | null;
  linkedinUrl: string | null;
  notes: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

// Service-worker request / response shapes.

export type CritiqueRequest = {
  type: 'critique';
  body: string;
  recipient: RecipientHints;
  surface: 'gmail' | 'linkedin';
};

export type CritiqueResponse =
  | { ok: true; flags: Flag[]; wordCount: number; takeaway: string }
  | { ok: false; error: string };

export type ChecklistRequest = {
  type: 'checklist';
  body: string;
  recipient: RecipientHints;
  surface: 'gmail' | 'linkedin';
};

export type ChecklistResponse =
  | { ok: true; items: ChecklistItem[]; passCount: number; totalCount: number }
  | { ok: false; error: string };

export type ConnectionAngleRequest = {
  type: 'connectionAngle';
  recipient: RecipientHints;
};

export type ConnectionAngleResponse =
  | { ok: true; angles: { headline: string; detail: string }[] }
  | { ok: false; error: string };

export type ServiceWorkerRequest =
  | CritiqueRequest
  | ChecklistRequest
  | ConnectionAngleRequest;

export type ServiceWorkerResponse =
  | CritiqueResponse
  | ChecklistResponse
  | ConnectionAngleResponse;
