import type { ContentData } from '@shared/content';
import type { Design } from '@shared/design';

export interface User { id: string; email: string; name: string; role: 'admin' | 'editor' | 'viewer'; via: string; hasPassword: boolean }
export interface AuthState {
  user: User | null; setupRequired: boolean; localLogin: boolean; authDisabled: boolean;
  oidc: { enabled: boolean; label: string; autoRedirect: boolean };
}
export interface CodeListItem {
  id: string; name: string; type: string; kind: 'static' | 'dynamic'; slug: string | null; shortUrl: string | null;
  enabled: boolean; expiresAt: string | null; folderId: string | null; tags: string[]; favorite: boolean;
  summary: string; scanTotal: number; tracking: boolean; createdAt: string; updatedAt: string; deletedAt: string | null;
}
export interface CodeEvent { kind: string; detail: string; at: string; user: string | null }
export interface CodeDetail extends CodeListItem {
  content: ContentData; design: Design; fallbackUrl: string | null; storeSecrets: boolean; note: string;
  linkScope: 'internal' | 'public' | null; missingSecrets: string[]; events: CodeEvent[]; lastScanAt: string | null;
}
export interface Folder { id: string; name: string; color: string; sort: number }
export interface Template { id: string; name: string; design: Design; createdAt: string; updatedAt: string }
export interface Settings {
  version: string; schema: number;
  publicBase: { url: string; source: 'settings' | 'env' | 'app' | 'request'; scope: 'internal' | 'public'; locked: boolean };
  statsAllowed: boolean; defaultTemplateId: string; dynamicCount: number;
  auth: { disabled: boolean; local: boolean; oidc: boolean; oidcIssuer: string }; maxUploadMb: number;
}
export interface Facets {
  types: Record<string, number>; tags: { tag: string; count: number }[]; folders: Record<string, number>;
  counts: { total: number; dynamic: number; favorites: number; trash: number; unfiled: number };
}
export interface VerifyResult {
  grade: 'good' | 'fair' | 'fail'; score: number; decodedMatches: boolean; ms: number;
  scenarios: { id: string; label: string; zxing: boolean; jsqr: boolean }[];
}
