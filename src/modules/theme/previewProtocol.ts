// Mensagens entre o editor de tema (painel) e a pré-visualização (iframe).
// Só são aceitas mensagens da mesma origem.
import type { ResolvedMode } from '../../lib/theme';
import type { Theme } from '../../types/database';

export interface EditorMessage {
  source: 'agenda-theme-editor';
  theme: Theme;
  logo_url: string | null;
  cover_url: string | null;
  mode: ResolvedMode;
}

export interface PreviewReadyMessage {
  source: 'agenda-preview';
  type: 'ready';
}

export function isEditorMessage(data: unknown): data is EditorMessage {
  return typeof data === 'object' && data !== null && (data as { source?: unknown }).source === 'agenda-theme-editor';
}

export function isPreviewReady(data: unknown): data is PreviewReadyMessage {
  return typeof data === 'object' && data !== null && (data as { source?: unknown }).source === 'agenda-preview';
}
