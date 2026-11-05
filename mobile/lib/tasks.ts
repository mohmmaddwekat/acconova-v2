import { StatusText, Tint, Colors } from '../constants/theme';
import { todayISO } from './format';

export interface TaskItem {
  id: number;
  title: string;
  description?: string | null;
  project_id?: number | null;
  status: string;
  priority: string;
  assignees?: number[];
  checklist?: { title: string; done: boolean }[];
  progress?: number;
  starts_on?: string | null;
  due_on?: string | null;
  estimated_hours?: number | null;
  comments_count?: number;
  attachments_count?: number;
}

export const TASK_STATUSES = [
  { key: 'idea', label: 'للتنفيذ' },
  { key: 'in_progress', label: 'قيد التنفيذ' },
  { key: 'review', label: 'مراجعة' },
  { key: 'completed', label: 'مكتملة' },
] as const;

export const TASK_PRIORITIES = [
  { key: 'low', label: 'منخفضة' },
  { key: 'medium', label: 'متوسطة' },
  { key: 'high', label: 'عالية' },
  { key: 'urgent', label: 'عاجلة' },
] as const;

export const statusLabel = (key: string) => TASK_STATUSES.find((s) => s.key === key)?.label ?? 'للتنفيذ';

export const priorityLabel = (key: string) => {
  const normal = key === 'normal' ? 'medium' : key;
  return TASK_PRIORITIES.find((p) => p.key === normal)?.label ?? 'متوسطة';
};

export function isOverdue(task: Pick<TaskItem, 'status' | 'due_on'>): boolean {
  return !!task.due_on && task.status !== 'completed' && task.due_on.slice(0, 10) < todayISO();
}

export function priorityColor(key: string): string {
  if (key === 'urgent') return StatusText.danger;
  if (key === 'high') return StatusText.warning;
  if (key === 'low') return Colors.textMuted;
  return Colors.accentStrong;
}

export function statusTone(key: string): { fg: string; bg: string } {
  if (key === 'completed') return { fg: StatusText.success, bg: Tint.successBg };
  if (key === 'review') return { fg: StatusText.warning, bg: Tint.warningBg };
  if (key === 'in_progress') return { fg: Colors.accentStrong, bg: Tint.infoBg };
  return { fg: Colors.textMuted, bg: Colors.bgSoft };
}

/** Pulls a list out of either a bare array or a paginator-style object. */
export function listOf<T>(body: unknown, key?: string): T[] {
  const root = (body as { data?: unknown } | null)?.data ?? body;
  if (Array.isArray(root)) return root as T[];
  const obj = root as Record<string, unknown> | null;
  const inner = key && obj ? obj[key] : undefined;
  if (Array.isArray(inner)) return inner as T[];
  if (obj && Array.isArray(obj.data)) return obj.data as T[];
  return [];
}
