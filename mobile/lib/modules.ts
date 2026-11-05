import { IconName } from '../components/ui/Icon';
import { todayISO } from './format';

export type Tone = 'ok' | 'warn' | 'bad' | 'info';

export interface ModuleRow {
  id: string;
  title: string;
  subtitle?: string;
  value?: string;
  badge?: { text: string; tone: Tone };
  raw?: Record<string, unknown>;
}

export interface RowAction {
  label: string;
  successMessage: string;
  visible: (raw: Record<string, unknown>) => boolean;
  request: (raw: Record<string, unknown>) => { method: 'patch' | 'post'; url: string; body?: Record<string, unknown> };
}

export interface ModuleDef {
  key: string;
  group: string;
  title: string;
  subtitle: string;
  icon: IconName;
  endpoint: string;
  params?: Record<string, unknown>;
  /** Optional custom mapping; modules without one use the generic field detection. */
  row?: (raw: Record<string, unknown>) => ModuleRow | null;
  createRoute?: string;
  createLabel?: string;
  rowAction?: RowAction;
}

const TASK_STATUS: Record<string, { text: string; tone: Tone }> = {
  idea: { text: 'فكرة', tone: 'info' },
  todo: { text: 'للتنفيذ', tone: 'info' },
  in_progress: { text: 'قيد التنفيذ', tone: 'info' },
  review: { text: 'مراجعة', tone: 'warn' },
  completed: { text: 'مكتملة', tone: 'ok' },
};

const PRIORITY: Record<string, string> = { low: 'منخفضة', medium: 'متوسطة', normal: 'عادية', high: 'عالية', urgent: 'عاجلة' };

function taskRow(raw: Record<string, unknown>): ModuleRow | null {
  if (raw.id == null || !raw.title) return null;
  const status = String(raw.status ?? 'idea');
  const due = raw.due_on ? String(raw.due_on).slice(0, 10) : null;
  const overdue = !!due && status !== 'completed' && due < todayISO();
  const base = TASK_STATUS[status] ?? { text: status, tone: 'info' as Tone };
  return {
    id: String(raw.id),
    title: String(raw.title),
    subtitle: [due ? `الاستحقاق ${due}` : null, raw.priority ? PRIORITY[String(raw.priority)] ?? String(raw.priority) : null].filter(Boolean).join(' • '),
    value: raw.progress != null ? `${raw.progress}%` : undefined,
    badge: overdue ? { text: 'متأخرة', tone: 'bad' } : base,
    raw,
  };
}

export const MODULES: ModuleDef[] = [
  { key: 'tasks', group: 'المهام والفريق', title: 'إدارة المهام', subtitle: 'مهامك ومهام الفريق', icon: 'checkSquare', endpoint: '/task-management/tasks', params: { per_page: 50 }, row: taskRow, createRoute: '/new-task', createLabel: 'مهمة جديدة', rowAction: { label: 'تم الإنجاز', successMessage: 'تم إنجاز المهمة', visible: (r) => r.status !== 'completed', request: (r) => ({ method: 'patch', url: `/task-management/tasks/${r.id}`, body: { status: 'completed', progress: 100, ...(r.revision != null ? { revision: r.revision } : {}) } }) } },
  { key: 'team-space', group: 'المهام والفريق', title: 'مساحة الفريق', subtitle: 'الأشخاص والرسائل', icon: 'chat', endpoint: '/team-space' },
  { key: 'departments', group: 'المهام والفريق', title: 'الأقسام', subtitle: 'الأقسام وسقوف الصرف', icon: 'users', endpoint: '/departments' },
  { key: 'roles', group: 'المهام والفريق', title: 'الأدوار والصلاحيات', subtitle: 'من يستطيع فعل ماذا', icon: 'lock', endpoint: '/workspace-roles' },
  { key: 'notification-rules', group: 'المهام والفريق', title: 'قواعد الإشعارات', subtitle: 'ما يصلك وكيف', icon: 'bell', endpoint: '/notification-rules' },

  { key: 'bank-reconciliation', group: 'المالية', title: 'المطابقة البنكية', subtitle: 'مطابقة الحركات البنكية', icon: 'card', endpoint: '/bank-reconciliation' },
  { key: 'taxes', group: 'المالية', title: 'الضرائب', subtitle: 'ملخص الضرائب', icon: 'dollar', endpoint: '/finance/taxes' },
  { key: 'anomalies', group: 'المالية', title: 'العمليات غير المعتادة', subtitle: 'تنبيهات يكتشفها النظام', icon: 'alertCircle', endpoint: '/business-pulse/anomalies' },
  { key: 'auto-allocation', group: 'المالية', title: 'التخصيص التلقائي', subtitle: 'ربط الدفعات بالفواتير', icon: 'refresh', endpoint: '/finance/auto-allocation' },
  { key: 'party-offsets', group: 'المالية', title: 'مقاصة الأطراف', subtitle: 'مقاصة بين العملاء والموردين', icon: 'refresh', endpoint: '/parties/offsets' },
  { key: 'payment-plans', group: 'المالية', title: 'خطط الدفع', subtitle: 'جداول السداد والتذكيرات', icon: 'calendar', endpoint: '/payment-plans' },
  { key: 'supplier-plans', group: 'المالية', title: 'خطط سداد الموردين', subtitle: 'جدولة مدفوعات الموردين', icon: 'calendar', endpoint: '/finance/supplier-payment-plans' },
  { key: 'archive', group: 'المالية', title: 'الأرشيف المالي', subtitle: 'المستندات المؤرشفة', icon: 'file', endpoint: '/finance/archive' },

  { key: 'requisitions', group: 'المشتريات والأطراف', title: 'طلبات الشراء', subtitle: 'طلبات بانتظار الموافقة', icon: 'fileDown', endpoint: '/purchase-requisitions' },
  { key: 'customer-intelligence', group: 'المشتريات والأطراف', title: 'ذكاء العملاء', subtitle: 'شرائح العملاء والمخاطر', icon: 'barChart', endpoint: '/customer-intelligence' },
  { key: 'credit-policy', group: 'المشتريات والأطراف', title: 'سياسة الائتمان', subtitle: 'حدود وشروط الائتمان', icon: 'lock', endpoint: '/credit-policy' },

  { key: 'warehouses', group: 'المخزون والإنتاج', title: 'المستودعات', subtitle: 'مواقع التخزين', icon: 'home', endpoint: '/warehouses' },
  { key: 'transfers', group: 'المخزون والإنتاج', title: 'تحويلات المستودعات', subtitle: 'طلبات النقل بين المستودعات', icon: 'refresh', endpoint: '/inventory/transfer-requests' },
  { key: 'inventory-intelligence', group: 'المخزون والإنتاج', title: 'ذكاء المخزون', subtitle: 'إعادة الطلب والراكد', icon: 'barChart', endpoint: '/inventory/intelligence' },
  { key: 'production', group: 'المخزون والإنتاج', title: 'الإنتاج', subtitle: 'أوامر الإنتاج', icon: 'checkSquare', endpoint: '/production-runs' },

  { key: 'scheduled-reports', group: 'التقارير', title: 'التقارير المجدولة', subtitle: 'تصلك دورياً', icon: 'clock', endpoint: '/scheduled-reports' },

  { key: 'audit', group: 'الإدارة والأمان', title: 'مركز التدقيق', subtitle: 'من فعل ماذا ومتى', icon: 'eye', endpoint: '/audit-center' },
  { key: 'bulk-actions', group: 'الإدارة والأمان', title: 'العمليات الجماعية', subtitle: 'سجل التعديلات الجماعية', icon: 'file', endpoint: '/bulk-action-history' },
  { key: 'restore', group: 'الإدارة والأمان', title: 'مركز الاسترجاع', subtitle: 'عناصر محذوفة', icon: 'refresh', endpoint: '/restore-center' },
  { key: 'security', group: 'الإدارة والأمان', title: 'مركز الأمان', subtitle: 'الجلسات والتحقق', icon: 'lock', endpoint: '/security/overview' },
  { key: 'system-checks', group: 'الإدارة والأمان', title: 'فحوصات النظام', subtitle: 'صحة النظام', icon: 'checkSquare', endpoint: '/system-checks' },
  { key: 'billing', group: 'الإدارة والأمان', title: 'الاشتراك والفوترة', subtitle: 'الخطة والاستخدام', icon: 'card', endpoint: '/billing/overview' },
  { key: 'mcp', group: 'الإدارة والأمان', title: 'MCP Hub', subtitle: 'تكاملات الذكاء الاصطناعي', icon: 'globe', endpoint: '/mcp/dashboard' },
  { key: 'customization', group: 'الإدارة والأمان', title: 'تخصيص النظام', subtitle: 'إعدادات المساحة', icon: 'monitor', endpoint: '/workspace-customization' },
  { key: 'payments', group: 'المالية', title: 'المدفوعات', subtitle: 'سجل المدفوعات', icon: 'dollar', endpoint: '/payment-records' },
  { key: 'petty-cash', group: 'المالية', title: 'صناديق النثريات', subtitle: 'أرصدة وصرف الصناديق', icon: 'banknote', endpoint: '/control/petty-cash' },
  { key: 'recurring-expenses', group: 'المالية', title: 'المصاريف المتكررة', subtitle: 'الالتزامات الدورية', icon: 'refresh', endpoint: '/control/recurring-expenses' },
  { key: 'budgets', group: 'المالية', title: 'الميزانية مقابل الفعلي', subtitle: 'متابعة الميزانيات', icon: 'barChart', endpoint: '/control/budgets' },
  { key: 'exchange-rates', group: 'المالية', title: 'أسعار الصرف', subtitle: 'أسعار العملات', icon: 'globe', endpoint: '/control/exchange-rates' },
  { key: 'landed-costs', group: 'المشتريات والأطراف', title: 'تكلفة الاستيراد والتوريد', subtitle: 'توزيع الشحن والجمارك', icon: 'fileDown', endpoint: '/control/landed-costs' },
  { key: 'contracts', group: 'المشتريات والأطراف', title: 'العقود', subtitle: 'العقود وتواريخ انتهائها', icon: 'file', endpoint: '/control/contracts' },
  { key: 'expiry-alerts', group: 'المخزون والإنتاج', title: 'انتهاء الصلاحية', subtitle: 'دفعات تقترب من الانتهاء', icon: 'clock', endpoint: '/control/expiry-alerts' },
  { key: 'expense-claims', group: 'المهام والفريق', title: 'مطالبات المصاريف', subtitle: 'مطالبات الموظفين', icon: 'banknote', endpoint: '/control/expense-claims' },
  { key: 'document-expiry', group: 'المهام والفريق', title: 'انتهاء الوثائق', subtitle: 'إقامات ورخص وعقود', icon: 'calendar', endpoint: '/control/document-expiry' },
  { key: 'spending-limits', group: 'المهام والفريق', title: 'سقوف صرف الأقسام', subtitle: 'الصرف الشهري لكل قسم', icon: 'lock', endpoint: '/control/spending-limits' },
  { key: 'data-quality', group: 'الإدارة والأمان', title: 'جودة البيانات', subtitle: 'مكررات وبيانات ناقصة', icon: 'checkSquare', endpoint: '/control/data-quality' },
];

export const MODULE_GROUPS = [...new Set(MODULES.map((m) => m.group))];
