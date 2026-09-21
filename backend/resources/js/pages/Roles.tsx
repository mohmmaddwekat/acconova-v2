import {
    ConfirmDialog,
} from '@/components/feedback/ConfirmDialog';
import {
    AppShell,
} from '@/layouts/AppShell';
import {
    ApiError,
    apiRequest,
} from '@/lib/http';
import {
    useLocale,
} from '@/lib/i18n';
import type {
    AppPageProps,
} from '@/types/app';
import {
    Head,
    usePage,
} from '@inertiajs/react';
import {
    BadgeDollarSign,
    Boxes,
    BriefcaseBusiness,
    Check,
    ChevronDown,
    ContactRound,
    Crown,
    Factory,
    KeyRound,
    Package,
    Pencil,
    Search,
    ShieldCheck,
    Sparkles,
    UserCog,
    Users,
    Wallet,
    X,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
    type FormEvent,
} from 'react';

type RolesView =
    | 'members'
    | 'assignment'
    | 'roles';

type Role = {
    id: number;
    name: string;
    base_role: string;
    permissions: string[];
    is_custom: boolean;
};

type Member = {
    id: number;
    user_id: number;
    role: string;
    workspace_role_id: number | null;
    role_name: string | null;
    access_mode: 'full' | 'custom' | 'built_in';
    effective_permissions: string[];
    permission_count: number;
    full_access: boolean;

    user: {
        name: string;
        email: string;
    };
};

type RolePreset = {
    name_ar: string;
    name_en: string;
    description_ar: string;
    description_en: string;
    category: string;
    permissions: string[];
};

type RolesResponse = {
    roles: Role[];
    members: Member[];
    presets: Record<string, RolePreset>;
    permission_keys: string[];
};

type PermissionGroup = {
    key: string;
    titleAr: string;
    titleEn: string;
    descriptionAr: string;
    descriptionEn: string;
    icon: typeof Package;
    permissions: string[];
};

const taskPermissionLabels: Record<string, [string, string]> = {
    'tasks.create': ['إنشاء مهام', 'Create tasks'],
    'tasks.view_team': ['عرض مهام القسم', 'View department tasks'],
    'tasks.view_all': ['عرض جميع مهام الشركة', 'View all company tasks'],
    'tasks.assign_team': ['إسناد المهام داخل القسم', 'Assign tasks within department'],
    'tasks.assign_all': ['إسناد المهام لأي موظف', 'Assign tasks to any employee'],
    'tasks.update_team': ['تعديل مهام القسم', 'Edit department tasks'],
    'tasks.update_all': ['تعديل جميع المهام', 'Edit all tasks'],
    'tasks.archive': ['أرشفة المهام', 'Archive tasks'],
    'tasks.reports': ['عرض تقارير المهام', 'View task reports'],
    'tasks.projects_manage': ['إنشاء وإدارة المشاريع', 'Create and manage projects'],
};

const teamPermissionLabels: Record<string, [string, string]> = {
    'teams.view': ['عرض صفحة الفرق والهيكل', 'View teams and hierarchy'],
    'teams.create': ['إنشاء فريق رئيسي', 'Create top-level teams'],
    'teams.update': ['تعديل بيانات الفريق', 'Edit team details'],
    'teams.archive': ['أرشفة الفرق', 'Archive teams'],
    'teams.members.manage': ['إضافة ونقل وإزالة الأعضاء', 'Add, move and remove members'],
    'teams.lead.manage': ['تعيين وتغيير قائد الفريق', 'Assign and change team lead'],
    'teams.projects.manage': ['ربط المشاريع بالفرق', 'Link projects to teams'],
    'teams.subteams.create': ['إنشاء فرق فرعية', 'Create sub-teams'],
    'teams.subteams.manage': ['إدارة الفرق الفرعية', 'Manage sub-teams'],
    'teams.move': ['نقل فريق داخل الشجرة', 'Move a team in the hierarchy'],
    'teams.view_workload': ['عرض عبء العمل والتحليلات', 'View team workload analytics'],
};

const fieldClass =
    'w-full rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3.5 py-3 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:bg-[var(--ac-surface)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]';

const secondaryButton =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-4 text-sm font-semibold text-[var(--ac-text)] transition hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)] disabled:cursor-not-allowed disabled:opacity-40';

const primaryButton =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-accent-solid)] px-5 text-sm font-semibold text-[var(--ac-accent-solid-text)] transition hover:bg-[var(--ac-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40';

const groups: PermissionGroup[] = [
    {
        key: 'tasks',
        titleAr: 'إدارة المهام والمشاريع',
        titleEn: 'Tasks & Projects',
        descriptionAr: 'إنشاء المهام ونطاق عرضها وإسنادها وتعديلها والتقارير.',
        descriptionEn: 'Task creation, visibility scope, assignment, editing and reports.',
        icon: Package,
        permissions: Object.keys(taskPermissionLabels),
    },
    {
        key: 'teams',
        titleAr: 'الفرق والهيكل التنظيمي',
        titleEn: 'Teams & Hierarchy',
        descriptionAr: 'صلاحيات مستقلة لإنشاء الفرق والفرق الفرعية والأعضاء والقادة والمشاريع.',
        descriptionEn: 'Granular authority for teams, sub-teams, members, leaders and linked projects.',
        icon: Users,
        permissions: Object.keys(teamPermissionLabels),
    },
    {
        key:
            'products',

        titleAr:
            'المنتجات والخدمات',

        titleEn:
            'Products & Services',

        descriptionAr:
            'المنتجات والخدمات والعمليات المرتبطة بها.',

        descriptionEn:
            'Products, services, and related operations.',

        icon:
            Package,

        permissions: [
            'products.view',
            'products.create',
            'products.update',
            'products.service',
            'products.manage',
            'products.archive',
        ],
    },

    {
        key:
            'parties',

        titleAr:
            'العملاء والموردون',

        titleEn:
            'Customers & Suppliers',

        descriptionAr:
            'إدارة وعرض بيانات العملاء والموردين والعلاقات التجارية.',

        descriptionEn:
            'Customers, suppliers, and business relationships.',

        icon:
            ContactRound,

        permissions: [
            'parties.view',
            'parties.create',
            'parties.update',
            'parties.manage',
            'parties.archive',
        ],
    },

    {
        key:
            'inventory',

        titleAr:
            'المخزون والمستودعات',

        titleEn:
            'Inventory & Warehouses',

        descriptionAr:
            'عرض الأرصدة وإدارة المخزون والمستودعات.',

        descriptionEn:
            'Stock visibility and warehouse management.',

        icon:
            Boxes,

        permissions: [
            'inventory.view',
            'inventory.manage',
        ],
    },

    {
        key:
            'production',

        titleAr:
            'الإنتاج',

        titleEn:
            'Production',

        descriptionAr:
            'عرض وتشغيل وتعديل عمليات الإنتاج.',

        descriptionEn:
            'View and manage production operations.',

        icon:
            Factory,

        permissions: [
            'production.view',
            'production.manage',
        ],
    },

    {
        key:
            'payments',

        titleAr:
            'المصاريف والمدفوعات',

        titleEn:
            'Expenses & Payments',

        descriptionAr:
            'العمليات المالية والمدفوعات والمصاريف.',

        descriptionEn:
            'Financial operations, expenses, and payments.',

        icon:
            Wallet,

        permissions: [
            'payments.view',
            'payments.create',
            'payments.update',
            'payments.record',
            'payments.manage',
        ],
    },

    {
        key:
            'finance',

        titleAr:
            'الفواتير والدفع والتحصيل والضرائب',

        titleEn:
            'Invoices, Cash & Taxes',

        descriptionAr:
            'فواتير البيع والشراء، المقبوضات والمدفوعات، التصحيحات والالتزامات الحكومية.',

        descriptionEn:
            'Sales and purchase invoices, receipts, payments, corrections and government obligations.',

        icon:
            BadgeDollarSign,

        permissions: [
            'finance.sales.view',
            'finance.sales.manage',
            'finance.purchases.view',
            'finance.purchases.manage',
            'finance.cash.view',
            'finance.cash.receive',
            'finance.cash.pay',
            'finance.cash.correct',
            'finance.documents.correct',
            'finance.approvals.review',
            'finance.taxes.view',
            'finance.taxes.manage',
        ],
    },

    {
        key:
            'staff',

        titleAr:
            'الموظفون والموارد البشرية',

        titleEn:
            'Employees & HR',

        descriptionAr:
            'صلاحيات دقيقة على القسم فقط أو على كل موظفي الشركة.',

        descriptionEn:
            'Department-scoped or company-wide employee permissions.',

        icon:
            Users,

        permissions: [
            'staff.team_view',
            'staff.team_manage',
            'staff.team_attendance',
            'staff.team_pay',

            'staff.view',
            'staff.manage',
            'staff.attendance',
            'staff.pay',
            'staff.import',
        ],
    },
];

/**
 * Return a localized label for one permission key.
 */
function permissionLabel(
    permission: string,
    ar: boolean,
): string {
    if (taskPermissionLabels[permission]) {
        return taskPermissionLabels[permission][ar ? 0 : 1];
    }

    if (teamPermissionLabels[permission]) {
        return teamPermissionLabels[permission][ar ? 0 : 1];
    }
    const labels: Record<
        string,
        [string, string]
    > = {
        'products.view': [
            'عرض المنتجات',
            'View products',
        ],

        'products.create': [
            'إضافة منتج',
            'Create products',
        ],

        'products.update': [
            'تعديل المنتجات',
            'Edit products',
        ],

        'products.service': [
            'تسجيل عمليات الخدمة',
            'Record service operations',
        ],

        'products.manage': [
            'إدارة كاملة للمنتجات',
            'Full product management',
        ],

        'products.archive': [
            'أرشفة واستعادة',
            'Archive & restore',
        ],

        'parties.view': [
            'عرض العملاء والموردين',
            'View customers & suppliers',
        ],

        'parties.create': [
            'إضافة عميل أو مورد',
            'Create customer or supplier',
        ],

        'parties.update': [
            'تعديل العملاء والموردين',
            'Edit customers & suppliers',
        ],

        'parties.manage': [
            'إدارة كاملة للعملاء والموردين',
            'Full customer & supplier management',
        ],

        'parties.archive': [
            'أرشفة واستعادة',
            'Archive & restore',
        ],

        'inventory.view': [
            'عرض المخزون',
            'View inventory',
        ],

        'inventory.manage': [
            'إدارة المخزون والمستودعات',
            'Manage inventory',
        ],

        'production.view': [
            'عرض الإنتاج',
            'View production',
        ],

        'production.manage': [
            'تشغيل وإدارة الإنتاج',
            'Manage production',
        ],

        'payments.view': [
            'عرض العمليات المالية',
            'View financial operations',
        ],

        'payments.create': [
            'إضافة عملية مالية',
            'Create financial operation',
        ],

        'payments.update': [
            'تعديل عملية مالية',
            'Edit financial operation',
        ],

        'payments.record': [
            'تسجيل دفعة أو قبض',
            'Record payment',
        ],

        'payments.manage': [
            'إدارة كاملة للعمليات المالية',
            'Full financial operation management',
        ],

        'finance.sales.view': [
            'عرض فواتير البيع',
            'View sales invoices',
        ],

        'finance.sales.manage': [
            'إنشاء وإدارة فواتير البيع',
            'Create & manage sales invoices',
        ],

        'finance.purchases.view': [
            'عرض فواتير الشراء',
            'View purchase invoices',
        ],

        'finance.purchases.manage': [
            'إنشاء وإدارة فواتير الشراء',
            'Create & manage purchase invoices',
        ],

        'finance.cash.view': [
            'عرض المدفوعات والمقبوضات',
            'View payments & receipts',
        ],

        'finance.cash.receive': [
            'تسجيل واعتماد المقبوضات',
            'Record & post receipts',
        ],

        'finance.cash.pay': [
            'تسجيل واعتماد المدفوعات',
            'Record & post payments',
        ],

        'finance.cash.correct': [
            'عكس وتصحيح الحركات النقدية',
            'Reverse & correct cash movements',
        ],

        'finance.documents.correct': [
            'تصحيح الفواتير بعد الإصدار',
            'Correct issued invoices',
        ],

        'finance.approvals.review': [
            'مراجعة واعتماد الموافقات المالية',
            'Review finance approvals',
        ],

        'finance.taxes.view': [
            'عرض الضرائب والمستحقات الحكومية',
            'View taxes & government obligations',
        ],

        'finance.taxes.manage': [
            'إدارة قواعد الضرائب والمستحقات',
            'Manage tax rules & obligations',
        ],

        'staff.team_view': [
            'عرض موظفي قسمي فقط',
            'View my department',
        ],

        'staff.team_manage': [
            'إدارة موظفي قسمي فقط',
            'Manage my department',
        ],

        'staff.team_attendance': [
            'حضور قسمي فقط',
            'Department attendance',
        ],

        'staff.team_pay': [
            'مستحقات قسمي فقط',
            'Department payroll',
        ],

        'staff.view': [
            'عرض جميع الموظفين',
            'View all employees',
        ],

        'staff.manage': [
            'إدارة جميع الموظفين',
            'Manage all employees',
        ],

        'staff.attendance': [
            'حضور كل الشركة',
            'Company attendance',
        ],

        'staff.pay': [
            'مستحقات كل الشركة',
            'Company payroll',
        ],

        'staff.import': [
            'استيراد الموظفين وبياناتهم من Excel/CSV',
            'Import employees and history from Excel/CSV',
        ],
    };

    const label =
        labels[permission];

    if (! label) {
        return permission;
    }

    return ar
        ? label[0]
        : label[1];
}

/**
 * Normalize client-side permission dependencies so the preview matches what
 * the server will persist.
 */
function normalizePermissions(
    input: string[],
): string[] {
    const permissions =
        new Set(input);

    for (
        const permission of
        Array.from(
            permissions,
        )
    ) {
        const module =
            permission
                .split('.')[0];

        if (
            [
                'products',
                'parties',
                'payments',
            ].includes(
                module,
            )
            && ! permission.endsWith(
                '.view',
            )
        ) {
            permissions.add(
                `${module}.view`,
            );
        }

        if (
            permission ===
            'products.service'
        ) {
            permissions.add(
                'parties.view',
            );
        }

        if (
            permission ===
            'inventory.manage'
        ) {
            permissions.add(
                'inventory.view',
            );

            permissions.add(
                'products.view',
            );
        }

        if (
            permission ===
            'production.view'
        ) {
            permissions.add(
                'inventory.view',
            );

            permissions.add(
                'products.view',
            );
        }

        if (
            permission ===
            'production.manage'
        ) {
            permissions.add(
                'production.view',
            );

            permissions.add(
                'inventory.view',
            );

            permissions.add(
                'products.view',
            );
        }

        if (
            permission ===
            'finance.sales.manage'
        ) {
            permissions.add(
                'finance.sales.view',
            );

            permissions.add(
                'parties.view',
            );

            permissions.add(
                'products.view',
            );
        }

        if (
            permission ===
            'finance.purchases.manage'
        ) {
            permissions.add(
                'finance.purchases.view',
            );

            permissions.add(
                'parties.view',
            );

            permissions.add(
                'products.view',
            );
        }

        if (
            [
                'finance.cash.receive',
                'finance.cash.pay',
                'finance.cash.correct',
            ].includes(
                permission,
            )
        ) {
            permissions.add(
                'finance.cash.view',
            );

            permissions.add(
                'parties.view',
            );

            if (
                permission ===
                'finance.cash.receive'
            ) {
                permissions.add(
                    'finance.sales.view',
                );
            }

            if (
                permission ===
                'finance.cash.pay'
            ) {
                permissions.add(
                    'finance.purchases.view',
                );
            }
        }

        if (
            permission ===
            'finance.documents.correct'
        ) {
            permissions.add(
                'finance.sales.view',
            );

            permissions.add(
                'finance.purchases.view',
            );
        }

        if (
            permission ===
            'finance.taxes.manage'
        ) {
            permissions.add(
                'finance.taxes.view',
            );
        }

        if (
            [
                'staff.manage',
                'staff.attendance',
                'staff.pay',
            ].includes(
                permission,
            )
        ) {
            permissions.add(
                'staff.view',
            );
        }

        if (
            permission ===
            'staff.import'
        ) {
            permissions.add(
                'staff.view',
            );

            permissions.add(
                'staff.manage',
            );
        }

        if (
            [
                'staff.team_manage',
                'staff.team_attendance',
                'staff.team_pay',
            ].includes(
                permission,
            )
        ) {
            permissions.add(
                'staff.team_view',
            );
        }

        if (
            permission.startsWith(
                'teams.',
            )
            && permission !==
                'teams.view'
        ) {
            permissions.add(
                'teams.view',
            );
        }

        if (
            permission ===
            'teams.subteams.create'
        ) {
            permissions.add(
                'teams.create',
            );
        }
    }

    return Array.from(
        permissions,
    );
}

/**
 * Render the active workspace roles page with a clean remount when switching
 * organizations.
 */
export default function RolesPage() {
    const {
        workspace,
    } =
        usePage<AppPageProps>().props;

    return (
        <RoleWorkspace
            key={
                workspace
                    .activeOrganization
                    ?.id
            }
        />
    );
}

/**
 * Render custom roles, employee promotion, and protected Owner information.
 */
function RoleWorkspace() {
    const locale =
        useLocale();

    const ar =
        locale ===
        'ar';

    const {
        workspace,
    } =
        usePage<AppPageProps>().props;

    const organization =
        workspace
            .activeOrganization;

    const allowed =
        organization?.role ===
        'owner';

    const [
        data,
        setData,
    ] =
        useState<RolesResponse | null>(
            null,
        );

    const [
        revision,
        setRevision,
    ] =
        useState(
            0,
        );

    const [
        error,
        setError,
    ] =
        useState(
            '',
        );

    const [
        success,
        setSuccess,
    ] =
        useState(
            '',
        );

    const [
        busy,
        setBusy,
    ] =
        useState(
            false,
        );

    const [
        editing,
        setEditing,
    ] =
        useState<Role | null>(
            null,
        );

    const [
        selectedPreset,
        setSelectedPreset,
    ] =
        useState<string | null>(
            null,
        );

    const [
        name,
        setName,
    ] =
        useState(
            '',
        );

    const [
        permissions,
        setPermissions,
    ] =
        useState<string[]>(
            [],
        );

    const [
        presetSearch,
        setPresetSearch,
    ] =
        useState(
            '',
        );

    const [
        selectedMemberId,
        setSelectedMemberId,
    ] =
        useState(
            '',
        );

    const [
        selectedRoleId,
        setSelectedRoleId,
    ] =
        useState(
            '',
        );

    const [
        ownerPassword,
        setOwnerPassword,
    ] =
        useState(
            '',
        );

    const [
        promotionConfirmOpen,
        setPromotionConfirmOpen,
    ] =
        useState(
            false,
        );

    const [
        revoking,
        setRevoking,
    ] =
        useState<Member | null>(
            null,
        );

    const [
        workspaceView,
        setWorkspaceView,
    ] =
        useState<RolesView>(
            'members',
        );

    const copy =
        ar
            ? {
                  title:
                      'الأدوار والصلاحيات',

                  subtitle:
                      'راجع كل مستخدم وصلاحياته الفعلية، ثم أنشئ أو عدّل الأدوار وعيّنها من نفس المكان.',


                  ownerTitle:
                      'مالك مساحة العمل',

                  ownerDescription:
                      'الـ Owner منفصل عن أدوار الموظفين ويمتلك وصولًا كاملًا دائمًا.',

                  fullAccess:
                      'وصول كامل',

                  cannotAssignOwner:
                      'لا يمكن ترقية أي موظف إلى Owner من نظام الأدوار.',

                  promotionTitle:
                      'ترقية / تغيير دور الموظف',

                  promotionDescription:
                      'اختر الموظف والدور الجديد، راجع الصلاحيات، ثم أدخل كلمة مرور المالك لاعتماد التغيير.',

                  employee:
                      'الموظف',

                  chooseEmployee:
                      'اختر موظفًا',

                  currentRole:
                      'الدور الحالي',

                  newRole:
                      'الدور الجديد',

                  chooseRole:
                      'اختر الدور الجديد',

                  ownerPassword:
                      'كلمة مرور المالك',

                  passwordHint:
                      'نطلب كلمة مرورك لحماية الترقيات الحساسة.',

                  promotionPreview:
                      'الصلاحيات بعد الترقية',

                  noRoleSelected:
                      'اختر دورًا لعرض صلاحياته.',

                  promote:
                      'اعتماد الترقية',

                  confirmPromotion:
                      'تأكيد ترقية الموظف',

                  promotionSuccess:
                      'تم تحديث دور الموظف بنجاح.',

                  presets:
                      'أدوار جاهزة',

                  presetsHint:
                      'ابدأ بقالب وظيفة حقيقي ثم عدّل الصلاحيات حسب شركتك.',

                  searchPreset:
                      'ابحث عن مدير مالي، رئيس قسم، مدير إنتاج…',

                  roleBuilder:
                      'تصميم الدور',

                  createRole:
                      'دور مخصص جديد',

                  editRole:
                      'تعديل الدور',

                  roleName:
                      'اسم الدور',

                  permissionMatrix:
                      'مصفوفة الصلاحيات',

                  permissionMatrixHint:
                      'كل خيار هنا صلاحية حقيقية يتم التحقق منها من السيرفر.',

                  selected:
                      'صلاحية محددة',

                  selectAll:
                      'تحديد المجموعة',

                  clear:
                      'إلغاء المجموعة',

                  save:
                      'حفظ الدور',

                  cancel:
                      'إلغاء',

                  roleLibrary:
                      'الأدوار المخصصة',

                  noRoles:
                      'لا توجد أدوار مخصصة بعد.',

                  members:
                      'أعضاء مساحة العمل',

                  owner:
                      'Owner',

                  revoke:
                      'إلغاء الوصول',

                  revokeHelp:
                      'سيتم إزالة هذا العضو من مساحة العمل.',

                  permissions:
                      'صلاحيات',

                  departmentScope:
                      'القسم المُدار فقط',

                  allCompany:
                      'كل الشركة',

                  totalTemplates:
                      'قوالب جاهزة',

                  customRoles:
                      'أدوار مخصصة',

                  assignedMembers:
                      'أعضاء بأدوار مخصصة',

                  realPermissions:
                      'صلاحيات فعلية',

                  startCustom:
                      'دور فارغ',

                  failed:
                      'حدث خطأ. يرجى المحاولة مرة أخرى.',

                  ownerOnly:
                      'هذه الصفحة متاحة لمالك مساحة العمل فقط.',
              }
            : {
                  title:
                      'Roles & Permissions',

                  subtitle:
                      'Review every member and their effective access, then create, edit and assign roles from one place.',


                  ownerTitle:
                      'Workspace Owner',

                  ownerDescription:
                      'Owner is separate from employee roles and always retains full access.',

                  fullAccess:
                      'Full access',

                  cannotAssignOwner:
                      'Employees cannot be promoted to Owner through the role system.',

                  promotionTitle:
                      'Promote / Change employee role',

                  promotionDescription:
                      'Choose an employee and a new role, review permissions, then enter the Owner password.',

                  employee:
                      'Employee',

                  chooseEmployee:
                      'Choose employee',

                  currentRole:
                      'Current role',

                  newRole:
                      'New role',

                  chooseRole:
                      'Choose new role',

                  ownerPassword:
                      'Owner password',

                  passwordHint:
                      'Your password is required to protect sensitive role promotions.',

                  promotionPreview:
                      'Permissions after promotion',

                  noRoleSelected:
                      'Choose a role to preview its permissions.',

                  promote:
                      'Confirm promotion',

                  confirmPromotion:
                      'Confirm employee promotion',

                  promotionSuccess:
                      'Employee role updated successfully.',

                  presets:
                      'Role templates',

                  presetsHint:
                      'Start with a practical business role and customize it.',

                  searchPreset:
                      'Search Finance Manager, Department Head…',

                  roleBuilder:
                      'Role designer',

                  createRole:
                      'New custom role',

                  editRole:
                      'Edit role',

                  roleName:
                      'Role name',

                  permissionMatrix:
                      'Permission matrix',

                  permissionMatrixHint:
                      'Every option below is enforced by the server.',

                  selected:
                      'permissions selected',

                  selectAll:
                      'Select group',

                  clear:
                      'Clear group',

                  save:
                      'Save role',

                  cancel:
                      'Cancel',

                  roleLibrary:
                      'Custom roles',

                  noRoles:
                      'No custom roles yet.',

                  members:
                      'Workspace members',

                  owner:
                      'Owner',

                  revoke:
                      'Revoke access',

                  revokeHelp:
                      'This member will be removed from the workspace.',

                  permissions:
                      'permissions',

                  departmentScope:
                      'Managed department only',

                  allCompany:
                      'Entire company',

                  totalTemplates:
                      'Role templates',

                  customRoles:
                      'Custom roles',

                  assignedMembers:
                      'Members with custom roles',

                  realPermissions:
                      'Real permissions',

                  startCustom:
                      'Blank role',

                  failed:
                      'Something went wrong. Please try again.',

                  ownerOnly:
                      'Only the workspace Owner can manage roles.',
              };

    /**
     * Load all role-management metadata.
     */
    useEffect(
        () => {
            if (! allowed) {
                return;
            }

            const controller =
                new AbortController();

            apiRequest<RolesResponse>(
                '/api/workspace-roles',
                {
                    signal:
                        controller.signal,
                },
            )
                .then(
                    setData,
                )
                .catch(
                    failure => {
                        if (
                            controller
                                .signal
                                .aborted
                        ) {
                            return;
                        }

                        setError(
                            failure instanceof
                                ApiError
                                ? failure.message
                                : copy.failed,
                        );
                    },
                );

            return () =>
                controller.abort();
        },
        [
            allowed,
            revision,
            copy.failed,
        ],
    );

    const presets =
        useMemo(
            () =>
                Object.entries(
                    data?.presets
                    ?? {},
                ).filter(
                    ([
                        ,
                        preset,
                    ]) => {
                        const query =
                            presetSearch
                                .trim()
                                .toLowerCase();

                        if (! query) {
                            return true;
                        }

                        return [
                            preset.name_ar,
                            preset.name_en,
                            preset.description_ar,
                            preset.description_en,
                        ]
                            .join(' ')
                            .toLowerCase()
                            .includes(
                                query,
                            );
                    },
                ),
            [
                data,
                presetSearch,
            ],
        );

    const ownerMember =
        data?.members.find(
            member =>
                member.role ===
                'owner',
        )
        ?? null;

    const assignableMembers =
        data?.members.filter(
            member =>
                member.role !==
                'owner',
        )
        ?? [];

    const selectedMember =
        assignableMembers.find(
            member =>
                member.id ===
                Number(
                    selectedMemberId,
                ),
        )
        ?? null;

    const selectedRole =
        data?.roles.find(
            role =>
                role.id ===
                Number(
                    selectedRoleId,
                ),
        )
        ?? null;

    const currentSelectedRole =
        selectedMember
            ? data?.roles.find(
                  role =>
                      role.id ===
                      selectedMember
                          .workspace_role_id,
              )
              ?? null
            : null;

    const assignedCustomCount =
        data?.members.filter(
            member =>
                member.workspace_role_id
                !== null,
        ).length
        ?? 0;

    const canPromote =
        Boolean(
            selectedMember
            && selectedRole
            && ownerPassword.trim(),
        );

    /**
     * Return a readable role label for one member.
     */
    function memberRoleLabel(
        member:
            Member | null,
    ): string {
        if (! member) {
            return '—';
        }

        if (
            member.role ===
            'owner'
        ) {
            return copy.owner;
        }

        const customRole =
            data?.roles.find(
                role =>
                    role.id ===
                    member.workspace_role_id,
            );

        if (customRole) {
            return customRole.name;
        }

        const builtin:
            Record<
                string,
                string
            > = ar
                ? {
                      admin:
                          'مدير نظام',

                      manager:
                          'مدير',

                      accountant:
                          'محاسب',

                      employee:
                          'موظف',
                  }
                : {
                      admin:
                          'Admin',

                      manager:
                          'Manager',

                      accountant:
                          'Accountant',

                      employee:
                          'Employee',
                  };

        return builtin[
            member.role
        ]
        ?? member.role;
    }

    /**
     * Reset custom role designer.
     */
    function resetDesigner(): void {
        setEditing(
            null,
        );

        setSelectedPreset(
            null,
        );

        setName(
            '',
        );

        setPermissions(
            [],
        );
    }

    /**
     * Apply a business role preset to the custom role designer.
     */
    function applyPreset(
        key: string,
        preset: RolePreset,
    ): void {
        setEditing(
            null,
        );

        setSelectedPreset(
            key,
        );

        setName(
            ar
                ? preset.name_ar
                : preset.name_en,
        );

        setPermissions(
            normalizePermissions(
                preset.permissions,
            ),
        );

        window.scrollTo({
            top:
                document.body.scrollHeight > 500
                    ? 400
                    : 0,

            behavior:
                'smooth',
        });
    }

    /**
     * Load one persisted custom role into the designer.
     */
    function editRole(
        role: Role,
    ): void {
        setEditing(
            role,
        );

        setSelectedPreset(
            null,
        );

        setName(
            role.name,
        );

        setPermissions(
            normalizePermissions(
                role.permissions,
            ),
        );
    }

    /**
     * Toggle one permission while preserving dependent permissions.
     */
    function togglePermission(
        permission: string,
    ): void {
        setPermissions(
            current => {
                if (
                    current.includes(
                        permission,
                    )
                ) {
                    let next =
                        current.filter(
                            item =>
                                item !==
                                permission,
                        );

                    if (
                        permission ===
                        'staff.team_view'
                    ) {
                        next =
                            next.filter(
                                item =>
                                    ! [
                                        'staff.team_manage',
                                        'staff.team_attendance',
                                        'staff.team_pay',
                                    ].includes(
                                        item,
                                    ),
                            );
                    }

                    if (
                        permission ===
                        'staff.view'
                    ) {
                        next =
                            next.filter(
                                item =>
                                    ! [
                                        'staff.manage',
                                        'staff.attendance',
                                        'staff.pay',
                                    ].includes(
                                        item,
                                    ),
                            );
                    }

                    if (
                        permission.endsWith(
                            '.view',
                        )
                        && ! permission.startsWith(
                            'staff.',
                        )
                        && ! permission.startsWith(
                            'finance.',
                        )
                    ) {
                        const module =
                            permission
                                .split('.')[0];

                        next =
                            next.filter(
                                item =>
                                    ! item.startsWith(
                                        `${module}.`,
                                    ),
                            );
                    }

                    if (
                        permission ===
                        'finance.sales.view'
                    ) {
                        next =
                            next.filter(
                                item =>
                                    ! [
                                        'finance.sales.manage',
                                        'finance.cash.receive',
                                        'finance.documents.correct',
                                    ].includes(
                                        item,
                                    ),
                            );
                    }

                    if (
                        permission ===
                        'finance.purchases.view'
                    ) {
                        next =
                            next.filter(
                                item =>
                                    ! [
                                        'finance.purchases.manage',
                                        'finance.cash.pay',
                                        'finance.documents.correct',
                                    ].includes(
                                        item,
                                    ),
                            );
                    }

                    if (
                        permission ===
                        'finance.cash.view'
                    ) {
                        next =
                            next.filter(
                                item =>
                                    ! [
                                        'finance.cash.receive',
                                        'finance.cash.pay',
                                        'finance.cash.correct',
                                    ].includes(
                                        item,
                                    ),
                            );
                    }

                    if (
                        permission ===
                        'finance.taxes.view'
                    ) {
                        next =
                            next.filter(
                                item =>
                                    item !==
                                    'finance.taxes.manage',
                            );
                    }

                    return normalizePermissions(
                        next,
                    );
                }

                return normalizePermissions([
                    ...current,
                    permission,
                ]);
            },
        );
    }

    /**
     * Toggle all permissions belonging to one module.
     */
    function toggleGroup(
        group:
            PermissionGroup,
    ): void {
        const allSelected =
            group.permissions.every(
                permission =>
                    permissions.includes(
                        permission,
                    ),
            );

        if (allSelected) {
            setPermissions(
                current =>
                    current.filter(
                        permission =>
                            ! group.permissions.includes(
                                permission,
                            ),
                    ),
            );

            return;
        }

        setPermissions(
            current =>
                normalizePermissions([
                    ...current,
                    ...group.permissions,
                ]),
        );
    }

    /**
     * Persist one custom role.
     */
    async function saveRole(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (busy) {
            return;
        }

        setBusy(
            true,
        );

        setError(
            '',
        );

        setSuccess(
            '',
        );

        try {
            await apiRequest(
                editing
                    ? `/api/workspace-roles/${editing.id}`
                    : '/api/workspace-roles',
                {
                    method:
                        editing
                            ? 'PATCH'
                            : 'POST',

                    body:
                        JSON.stringify({
                            name:
                                name.trim(),

                            base_role:
                                'employee',

                            is_custom:
                                true,

                            preset_key:
                                selectedPreset,

                            permissions:
                                normalizePermissions(
                                    permissions,
                                ),
                        }),
                },
            );

            resetDesigner();

            setRevision(
                value =>
                    value
                    + 1,
            );

            setSuccess(
                ar
                    ? 'تم حفظ الدور بنجاح.'
                    : 'Role saved successfully.',
            );
        } catch (failure) {
            setError(
                failure instanceof
                    ApiError
                    ? [
                          failure.message,
                          ...Object.values(
                              failure.errors,
                          ).flat(),
                      ]
                          .filter(
                              Boolean,
                          )
                          .join(' ')
                    : copy.failed,
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    /**
     * Promote or change one employee role after verifying the current Owner
     * password on the server.
     */
    async function promoteMember(): Promise<void> {
        if (
            ! selectedMember
            || ! selectedRole
            || ! ownerPassword
            || busy
        ) {
            return;
        }

        setBusy(
            true,
        );

        setError(
            '',
        );

        setSuccess(
            '',
        );

        try {
            await apiRequest(
                '/api/workspace-roles/assign',
                {
                    method:
                        'POST',

                    body:
                        JSON.stringify({
                            email:
                                selectedMember
                                    .user
                                    .email,

                            confirmed_user_id:
                                selectedMember
                                    .user_id,

                            workspace_role_id:
                                selectedRole
                                    .id,

                            current_password:
                                ownerPassword,
                        }),
                },
            );

            setPromotionConfirmOpen(
                false,
            );

            setOwnerPassword(
                '',
            );

            setSelectedMemberId(
                '',
            );

            setSelectedRoleId(
                '',
            );

            setRevision(
                value =>
                    value
                    + 1,
            );

            setSuccess(
                copy.promotionSuccess,
            );
        } catch (failure) {
            setPromotionConfirmOpen(
                false,
            );

            setError(
                failure instanceof
                    ApiError
                    ? [
                          failure.message,
                          ...Object.values(
                              failure.errors,
                          ).flat(),
                      ]
                          .filter(
                              Boolean,
                          )
                          .join(' ')
                    : copy.failed,
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    /**
     * Remove one normal member from the active workspace.
     */
    async function revokeMember(): Promise<void> {
        if (
            ! revoking
            || busy
            || ! organization?.id
        ) {
            return;
        }

        setBusy(
            true,
        );

        setError(
            '',
        );

        try {
            await apiRequest(
                `/api/organizations/${organization.id}/memberships/${revoking.id}`,
                {
                    method:
                        'DELETE',
                },
            );

            setRevoking(
                null,
            );

            setRevision(
                value =>
                    value
                    + 1,
            );
        } catch (failure) {
            setError(
                failure instanceof
                    ApiError
                    ? failure.message
                    : copy.failed,
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    return (
        <AppShell>
            <Head
                title={
                    copy.title
                }
            />

            <main className="mx-auto w-full max-w-[1680px] space-y-5 px-3 py-5 sm:px-5 lg:px-8">
                <header className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] text-[var(--ac-accent)]">
                                <ShieldCheck size={18} />
                            </span>

                            <div>
                                <h1 className="text-xl font-bold tracking-[-0.03em] text-[var(--ac-text)] sm:text-2xl">
                                    {copy.title}
                                </h1>

                                <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[var(--ac-text-muted)] sm:text-xs">
                                    {copy.subtitle}
                                </p>
                            </div>
                        </div>
                    </div>
                </header>

                {! allowed ? (
                    <div className="rounded-[22px] border border-amber-500/20 bg-amber-500/10 p-5 text-sm text-[var(--ac-text-soft)]">
                        {
                            copy.ownerOnly
                        }
                    </div>
                ) : (
                    <>
                        {error && (
                            <div className="flex items-center justify-between gap-4 rounded-[16px] border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-500">
                                <span>
                                    {
                                        error
                                    }
                                </span>

                                <button
                                    type="button"
                                    onClick={() =>
                                        setError(
                                            '',
                                        )
                                    }
                                >
                                    <X
                                        size={
                                            15
                                        }
                                    />
                                </button>
                            </div>
                        )}

                        {success && (
                            <div className="flex items-center gap-2 rounded-[16px] border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-500">
                                <Check
                                    size={
                                        15
                                    }
                                />

                                {
                                    success
                                }
                            </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <SummaryCard
                                icon={
                                    Sparkles
                                }
                                label={
                                    copy.totalTemplates
                                }
                                value={String(
                                    Object.keys(
                                        data?.presets
                                        ?? {},
                                    ).length,
                                )}
                            />

                            <SummaryCard
                                icon={
                                    ShieldCheck
                                }
                                label={
                                    copy.customRoles
                                }
                                value={String(
                                    data?.roles.length
                                    ?? 0,
                                )}
                            />

                            <SummaryCard
                                icon={
                                    UserCog
                                }
                                label={
                                    copy.assignedMembers
                                }
                                value={String(
                                    assignedCustomCount,
                                )}
                            />

                            <SummaryCard
                                icon={
                                    Crown
                                }
                                label={
                                    copy.realPermissions
                                }
                                value={String(
                                    data?.permission_keys
                                        .length
                                    ?? 0,
                                )}
                            />
                        </div>

                        <nav
                            aria-label={ar ? 'أقسام الصلاحيات' : 'Permission sections'}
                            className="flex flex-wrap gap-1 rounded-[15px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-1.5"
                        >
                            {([
                                [
                                    'members',
                                    Users,
                                    ar
                                        ? 'الأعضاء والصلاحيات'
                                        : 'Members & access',
                                ],
                                [
                                    'assignment',
                                    UserCog,
                                    ar
                                        ? 'تعيين الأدوار'
                                        : 'Assign roles',
                                ],
                                [
                                    'roles',
                                    ShieldCheck,
                                    ar
                                        ? 'تصميم الأدوار'
                                        : 'Role designer',
                                ],
                            ] as const).map(
                                ([
                                    view,
                                    Icon,
                                    label,
                                ]) => (
                                    <button
                                        key={view}
                                        type="button"
                                        onClick={() =>
                                            setWorkspaceView(
                                                view,
                                            )
                                        }
                                        className={[
                                            'inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[11px] px-4 text-[10px] font-bold transition sm:flex-none',
                                            workspaceView ===
                                            view
                                                ? 'bg-[var(--ac-surface)] text-[var(--ac-text)] shadow-[var(--ac-shadow-soft)]'
                                                : 'text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)] hover:text-[var(--ac-text)]',
                                        ].join(
                                            ' ',
                                        )}
                                    >
                                        <Icon size={13} />
                                        {label}
                                    </button>
                                ),
                            )}
                        </nav>

                        {workspaceView === 'members' && (
                        <MemberAccessMatrix
                            members={data?.members ?? []}
                            roles={data?.roles ?? []}
                            permissionKeys={data?.permission_keys ?? []}
                            ar={ar}
                            busy={busy}
                            onEditRole={role => {
                                setWorkspaceView(
                                    'roles',
                                );
                                editRole(
                                    role,
                                );
                            }}
                            onAssign={member => {
                                setWorkspaceView(
                                    'assignment',
                                );
                                setSelectedMemberId(
                                    String(member.id),
                                );

                                window.requestAnimationFrame(() => {
                                    document
                                        .getElementById('role-assignment')
                                        ?.scrollIntoView({
                                            behavior: 'smooth',
                                            block: 'start',
                                        });
                                });
                            }}
                            onRevoke={member =>
                                setRevoking(member)
                            }
                        />
                        )}

                        <div
                            className={
                                workspaceView === 'assignment'
                                    ? 'grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]'
                                    : 'hidden'
                            }
                        >
                            <section className="rounded-[24px] border border-amber-500/20 bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)]">
                                <div className="flex items-center gap-3">
                                    <span className="flex size-12 items-center justify-center rounded-[15px] bg-amber-500/10 text-amber-500">
                                        <Crown
                                            size={
                                                20
                                            }
                                        />
                                    </span>

                                    <div>
                                        <h2 className="font-semibold">
                                            {
                                                copy.ownerTitle
                                            }
                                        </h2>

                                        <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                            {
                                                copy.ownerDescription
                                            }
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-5 flex items-center gap-3 rounded-[17px] bg-[var(--ac-surface-soft)] p-4">
                                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--ac-surface)] text-base font-bold">
                                        {ownerMember
                                            ?.user
                                            .name
                                            .charAt(
                                                0,
                                            )
                                            .toUpperCase()
                                            ?? 'O'}
                                    </span>

                                    <div className="min-w-0">
                                        <strong className="block truncate text-sm">
                                            {ownerMember
                                                ?.user
                                                .name
                                            ?? '—'}
                                        </strong>

                                        <p className="mt-1 truncate text-[10px] text-[var(--ac-text-muted)]">
                                            {ownerMember
                                                ?.user
                                                .email
                                            ?? '—'}
                                        </p>

                                        <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[9px] font-bold text-amber-500">
                                            <Crown
                                                size={
                                                    10
                                                }
                                            />

                                            {
                                                copy.fullAccess
                                            }
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-4 rounded-[15px] border border-amber-500/20 bg-amber-500/10 p-4 text-[10px] leading-5 text-[var(--ac-text-soft)]">
                                    {
                                        copy.cannotAssignOwner
                                    }
                                </div>
                            </section>

                            <section id="role-assignment" className="scroll-mt-24 rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)] sm:p-6">
                                <div className="flex items-start gap-3">
                                    <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                        <UserCog
                                            size={
                                                19
                                            }
                                        />
                                    </span>

                                    <div>
                                        <h2 className="text-lg font-semibold">
                                            {
                                                copy.promotionTitle
                                            }
                                        </h2>

                                        <p className="mt-1 text-xs leading-5 text-[var(--ac-text-muted)]">
                                            {
                                                copy.promotionDescription
                                            }
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-6 grid gap-4 md:grid-cols-2">
                                    <label className="text-xs font-semibold">
                                        {
                                            copy.employee
                                        }

                                        <select
                                            value={
                                                selectedMemberId
                                            }
                                            onChange={event => {
                                                setSelectedMemberId(
                                                    event
                                                        .target
                                                        .value,
                                                );

                                                setSelectedRoleId(
                                                    '',
                                                );
                                            }}
                                            className={`${fieldClass} mt-2`}
                                        >
                                            <option value="">
                                                {
                                                    copy.chooseEmployee
                                                }
                                            </option>

                                            {assignableMembers.map(
                                                member => (
                                                    <option
                                                        key={
                                                            member.id
                                                        }
                                                        value={
                                                            member.id
                                                        }
                                                    >
                                                        {
                                                            member.user.name
                                                        }
                                                        {' — '}
                                                        {
                                                            member.user.email
                                                        }
                                                    </option>
                                                ),
                                            )}
                                        </select>
                                    </label>

                                    <div>
                                        <p className="text-xs font-semibold">
                                            {
                                                copy.currentRole
                                            }
                                        </p>

                                        <div className="mt-2 flex min-h-[46px] items-center rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-4 text-sm font-semibold">
                                            {
                                                memberRoleLabel(
                                                    selectedMember,
                                                )
                                            }
                                        </div>
                                    </div>

                                    <label className="text-xs font-semibold">
                                        {
                                            copy.newRole
                                        }

                                        <select
                                            value={
                                                selectedRoleId
                                            }
                                            onChange={event =>
                                                setSelectedRoleId(
                                                    event
                                                        .target
                                                        .value,
                                                )
                                            }
                                            disabled={
                                                ! selectedMember
                                            }
                                            className={`${fieldClass} mt-2`}
                                        >
                                            <option value="">
                                                {
                                                    copy.chooseRole
                                                }
                                            </option>

                                            {data?.roles.map(
                                                role => (
                                                    <option
                                                        key={
                                                            role.id
                                                        }
                                                        value={
                                                            role.id
                                                        }
                                                    >
                                                        {
                                                            role.name
                                                        }
                                                    </option>
                                                ),
                                            )}
                                        </select>
                                    </label>

                                    <label className="text-xs font-semibold">
                                        {
                                            copy.ownerPassword
                                        }

                                        <div className="relative mt-2">
                                            <KeyRound
                                                size={
                                                    15
                                                }
                                                className="absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
                                            />

                                            <input
                                                type="password"
                                                autoComplete="current-password"
                                                value={
                                                    ownerPassword
                                                }
                                                onChange={event =>
                                                    setOwnerPassword(
                                                        event
                                                            .target
                                                            .value,
                                                    )
                                                }
                                                className={`${fieldClass} ps-10`}
                                            />
                                        </div>

                                        <span className="mt-1.5 block text-[9px] font-normal text-[var(--ac-text-muted)]">
                                            {
                                                copy.passwordHint
                                            }
                                        </span>
                                    </label>
                                </div>

                                <div className="mt-5 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-semibold">
                                                {
                                                    copy.promotionPreview
                                                }
                                            </p>

                                            {selectedMember && (
                                                <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                                    {
                                                        selectedMember.user.name
                                                    }
                                                    {' · '}
                                                    {
                                                        memberRoleLabel(
                                                            selectedMember,
                                                        )
                                                    }
                                                    {' → '}
                                                    {
                                                        selectedRole?.name
                                                        ?? '—'
                                                    }
                                                </p>
                                            )}
                                        </div>

                                        {selectedRole && (
                                            <span className="rounded-full bg-[var(--ac-surface)] px-3 py-1.5 text-[9px] font-bold text-[var(--ac-accent)]">
                                                {
                                                    selectedRole.permissions
                                                        .length
                                                }
                                                {' '}
                                                {
                                                    copy.permissions
                                                }
                                            </span>
                                        )}
                                    </div>

                                    {selectedRole ? (
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {selectedRole.permissions.map(
                                                permission => (
                                                    <span
                                                        key={
                                                            permission
                                                        }
                                                        className="rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-2.5 py-1.5 text-[9px] font-medium"
                                                    >
                                                        {
                                                            permissionLabel(
                                                                permission,
                                                                ar,
                                                            )
                                                        }
                                                    </span>
                                                ),
                                            )}
                                        </div>
                                    ) : (
                                        <p className="mt-4 text-xs text-[var(--ac-text-muted)]">
                                            {
                                                copy.noRoleSelected
                                            }
                                        </p>
                                    )}
                                </div>

                                <div className="mt-5 flex justify-end">
                                    <button
                                        type="button"
                                        disabled={
                                            ! canPromote
                                            || busy
                                            || (
                                                currentSelectedRole?.id
                                                === selectedRole?.id
                                            )
                                        }
                                        onClick={() =>
                                            setPromotionConfirmOpen(
                                                true,
                                            )
                                        }
                                        className={
                                            primaryButton
                                        }
                                    >
                                        <ShieldCheck
                                            size={
                                                15
                                            }
                                        />

                                        {
                                            copy.promote
                                        }
                                    </button>
                                </div>
                            </section>
                        </div>

                        <section
                            className={
                                workspaceView === 'roles'
                                    ? 'rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5'
                                    : 'hidden'
                            }
                        >
                            <div className="flex flex-wrap items-end justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-semibold">
                                        {
                                            copy.presets
                                        }
                                    </h2>

                                    <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                        {
                                            copy.presetsHint
                                        }
                                    </p>
                                </div>

                                <div className="relative w-full max-w-sm">
                                    <Search
                                        size={
                                            15
                                        }
                                        className="absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
                                    />

                                    <input
                                        value={
                                            presetSearch
                                        }
                                        onChange={event =>
                                            setPresetSearch(
                                                event
                                                    .target
                                                    .value,
                                            )
                                        }
                                        placeholder={
                                            copy.searchPreset
                                        }
                                        className={`${fieldClass} ps-10`}
                                    />
                                </div>
                            </div>

                            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                {presets.map(
                                    ([
                                        key,
                                        preset,
                                    ]) => (
                                        <button
                                            type="button"
                                            key={
                                                key
                                            }
                                            onClick={() =>
                                                applyPreset(
                                                    key,
                                                    preset,
                                                )
                                            }
                                            className={[
                                                'group rounded-[18px] border p-4 text-start transition',
                                                selectedPreset ===
                                                key
                                                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]'
                                                    : 'border-[var(--ac-line)] bg-[var(--ac-surface-soft)] hover:-translate-y-0.5 hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface)] hover:text-[var(--ac-text)] hover:shadow-md',
                                            ].join(
                                                ' ',
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <RoleCategoryIcon
                                                    category={
                                                        preset.category
                                                    }
                                                />

                                                <span className="rounded-full bg-[var(--ac-surface)] px-2 py-1 text-[8px] font-bold text-[var(--ac-text-muted)]">
                                                    {
                                                        preset.permissions.length
                                                    }
                                                    {' '}
                                                    {
                                                        copy.permissions
                                                    }
                                                </span>
                                            </div>

                                            <strong className="mt-4 block text-sm">
                                                {ar
                                                    ? preset.name_ar
                                                    : preset.name_en}
                                            </strong>

                                            <p className="mt-2 line-clamp-3 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                                {ar
                                                    ? preset.description_ar
                                                    : preset.description_en}
                                            </p>
                                        </button>
                                    ),
                                )}

                                <button
                                    type="button"
                                    onClick={
                                        resetDesigner
                                    }
                                    className="flex min-h-[150px] flex-col items-center justify-center rounded-[18px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 text-center text-[var(--ac-text)] transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-accent-soft)]"
                                >
                                    <div className="flex size-11 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)]">
                                        <UserCog
                                            size={
                                                18
                                            }
                                        />
                                    </div>

                                    <strong className="mt-3 text-xs">
                                        {
                                            copy.startCustom
                                        }
                                    </strong>
                                </button>
                            </div>
                        </section>

                        <div
                            className={
                                workspaceView === 'roles'
                                    ? 'grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]'
                                    : 'hidden'
                            }
                        >
                            <form
                                onSubmit={event =>
                                    void saveRole(
                                        event,
                                    )
                                }
                                className="rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)] sm:p-6"
                            >
                                <fieldset
                                    disabled={
                                        busy
                                    }
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                                                {
                                                    copy.roleBuilder
                                                }
                                            </p>

                                            <h2 className="mt-1 text-lg font-semibold">
                                                {editing
                                                    ? copy.editRole
                                                    : copy.createRole}
                                            </h2>
                                        </div>

                                        <span className="rounded-full bg-[var(--ac-accent-soft)] px-3 py-2 text-[10px] font-semibold text-[var(--ac-accent-strong)]">
                                            {
                                                permissions.length
                                            }
                                            {' '}
                                            {
                                                copy.selected
                                            }
                                        </span>
                                    </div>

                                    <label className="mt-5 block text-xs font-semibold">
                                        {
                                            copy.roleName
                                        }

                                        <input
                                            required
                                            maxLength={
                                                100
                                            }
                                            value={
                                                name
                                            }
                                            onChange={event =>
                                                setName(
                                                    event
                                                        .target
                                                        .value,
                                                )
                                            }
                                            className={`${fieldClass} mt-2`}
                                        />
                                    </label>

                                    <div className="mt-7">
                                        <h3 className="font-semibold">
                                            {
                                                copy.permissionMatrix
                                            }
                                        </h3>

                                        <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                            {
                                                copy.permissionMatrixHint
                                            }
                                        </p>
                                    </div>

                                    <div className="mt-4 space-y-3">
                                        {groups.map(
                                            group => {
                                                const Icon =
                                                    group.icon;

                                                const allSelected =
                                                    group.permissions.every(
                                                        permission =>
                                                            permissions.includes(
                                                                permission,
                                                            ),
                                                    );

                                                return (
                                                    <section
                                                        key={
                                                            group.key
                                                        }
                                                        className="rounded-[19px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4"
                                                    >
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div className="flex items-start gap-3">
                                                                <span className="flex size-10 items-center justify-center rounded-[13px] bg-[var(--ac-surface)] text-[var(--ac-accent-strong)]">
                                                                    <Icon
                                                                        size={
                                                                            17
                                                                        }
                                                                    />
                                                                </span>

                                                                <div>
                                                                    <h4 className="text-sm font-semibold">
                                                                        {ar
                                                                            ? group.titleAr
                                                                            : group.titleEn}
                                                                    </h4>

                                                                    <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                                                        {ar
                                                                            ? group.descriptionAr
                                                                            : group.descriptionEn}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    toggleGroup(
                                                                        group,
                                                                    )
                                                                }
                                                                className="rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 py-2 text-[9px] font-semibold"
                                                            >
                                                                {allSelected
                                                                    ? copy.clear
                                                                    : copy.selectAll}
                                                            </button>
                                                        </div>

                                                        {group.key ===
                                                            'teams' && (
                                                            <div className="mt-4 grid gap-2 sm:grid-cols-3">
                                                                <div className="rounded-[13px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 text-[9px] text-[var(--ac-text-muted)]">
                                                                    <strong className="block text-[var(--ac-text)]">
                                                                        {ar ? 'نطاق القسم' : 'Department scope'}
                                                                    </strong>
                                                                    {ar
                                                                        ? 'مدير القسم يدير الفرق الموجودة داخل قسمه فقط.'
                                                                        : 'Department managers act only on teams inside their department.'}
                                                                </div>

                                                                <div className="rounded-[13px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 text-[9px] text-[var(--ac-text-muted)]">
                                                                    <strong className="block text-[var(--ac-text)]">
                                                                        {ar ? 'نطاق قائد الفريق' : 'Team lead scope'}
                                                                    </strong>
                                                                    {ar
                                                                        ? 'قائد الفريق يرى فريقه والفرق المتفرعة تحته ضمن الصلاحيات الممنوحة.'
                                                                        : 'A team lead is scoped to their team and descendant teams.'}
                                                                </div>

                                                                <div className="rounded-[13px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 text-[9px] text-[var(--ac-text-muted)]">
                                                                    <strong className="block text-[var(--ac-text)]">
                                                                        {ar ? 'الشركة كاملة' : 'Company-wide'}
                                                                    </strong>
                                                                    {ar
                                                                        ? 'المالك والإدارة العليا يمكنهم العمل على كامل شجرة الفرق.'
                                                                        : 'Owner and company-wide authority can manage the full team tree.'}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {group.key ===
                                                            'staff' && (
                                                            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                                                <div className="rounded-[13px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 text-[9px] text-[var(--ac-text-muted)]">
                                                                    <strong className="block text-[var(--ac-text)]">
                                                                        {ar ? 'النظرة العامة والدليل' : 'Overview & directory'}
                                                                    </strong>
                                                                    {ar
                                                                        ? 'staff.team_view يعرض موظفي القسم فقط، وstaff.view يعرض كل موظفي الشركة.'
                                                                        : 'staff.team_view is department-scoped; staff.view covers the full company.'}
                                                                </div>

                                                                <div className="rounded-[13px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 text-[9px] text-[var(--ac-text-muted)]">
                                                                    <strong className="block text-[var(--ac-text)]">
                                                                        {ar ? 'صفحة الحضور' : 'Attendance page'}
                                                                    </strong>
                                                                    {ar
                                                                        ? 'تحتاج staff.team_attendance للقسم أو staff.attendance لكل الشركة.'
                                                                        : 'Requires staff.team_attendance for a department or staff.attendance company-wide.'}
                                                                </div>

                                                                <div className="rounded-[13px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 text-[9px] text-[var(--ac-text-muted)]">
                                                                    <strong className="block text-[var(--ac-text)]">
                                                                        {ar ? 'الرواتب والمستحقات' : 'Payroll & balances'}
                                                                    </strong>
                                                                    {ar
                                                                        ? 'الأرقام المالية تظهر فقط مع staff.team_pay أو staff.pay.'
                                                                        : 'Financial employee totals require staff.team_pay or staff.pay.'}
                                                                </div>

                                                                <div className="rounded-[13px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 text-[9px] text-[var(--ac-text-muted)]">
                                                                    <strong className="block text-[var(--ac-text)]">
                                                                        {ar ? 'إدارة الملفات' : 'Profile management'}
                                                                    </strong>
                                                                    {ar
                                                                        ? 'التعديل والإضافة يحتاجان staff.team_manage أو staff.manage حسب النطاق.'
                                                                        : 'Creating and editing profiles requires staff.team_manage or staff.manage for the relevant scope.'}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                            {group.permissions.map(
                                                                permission => {
                                                                    const checked =
                                                                        permissions.includes(
                                                                            permission,
                                                                        );

                                                                    const departmentScoped =
                                                                        permission.startsWith(
                                                                            'staff.team_',
                                                                        );

                                                                    return (
                                                                        <button
                                                                            type="button"
                                                                            key={
                                                                                permission
                                                                            }
                                                                            aria-pressed={
                                                                                checked
                                                                            }
                                                                            onClick={() =>
                                                                                togglePermission(
                                                                                    permission,
                                                                                )
                                                                            }
                                                                            className={[
                                                                                'flex min-h-12 items-center gap-3 rounded-[13px] border px-3 py-2.5 text-start text-[10px] transition',
                                                                                checked
                                                                                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] font-semibold text-[var(--ac-accent)] shadow-sm'
                                                                                    : 'border-[var(--ac-line)] bg-[var(--ac-surface)]/60 text-[var(--ac-text-soft)] hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)] hover:text-[var(--ac-text)]',
                                                                            ].join(
                                                                                ' ',
                                                                            )}
                                                                        >
                                                                            <span
                                                                                className={[
                                                                                    'flex size-5 shrink-0 items-center justify-center rounded-[6px] border',
                                                                                    checked
                                                                                        ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-strong)] text-white'
                                                                                        : 'border-[var(--ac-line)]',
                                                                                ].join(
                                                                                    ' ',
                                                                                )}
                                                                            >
                                                                                {checked && (
                                                                                    <Check
                                                                                        size={
                                                                                            12
                                                                                        }
                                                                                    />
                                                                                )}
                                                                            </span>

                                                                            <span className="min-w-0 flex-1">
                                                                                {
                                                                                    permissionLabel(
                                                                                        permission,
                                                                                        ar,
                                                                                    )
                                                                                }

                                                                                {departmentScoped && (
                                                                                    <small className="mt-0.5 block text-[8px] font-normal text-[var(--ac-text-muted)]">
                                                                                        {
                                                                                            copy.departmentScope
                                                                                        }
                                                                                    </small>
                                                                                )}
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                },
                                                            )}
                                                        </div>
                                                    </section>
                                                );
                                            },
                                        )}
                                    </div>

                                    <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-[var(--ac-line)] pt-5">
                                        {editing && (
                                            <button
                                                type="button"
                                                onClick={
                                                    resetDesigner
                                                }
                                                className={
                                                    secondaryButton
                                                }
                                            >
                                                {
                                                    copy.cancel
                                                }
                                            </button>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={
                                                ! name.trim()
                                            }
                                            className={
                                                primaryButton
                                            }
                                        >
                                            <Check
                                                size={
                                                    14
                                                }
                                            />

                                            {
                                                copy.save
                                            }
                                        </button>
                                    </div>
                                </fieldset>
                            </form>

                            <aside className="space-y-5">
                                <section className="rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)]">
                                    <h2 className="font-semibold">
                                        {
                                            copy.roleLibrary
                                        }
                                    </h2>

                                    <div className="mt-4 space-y-2">
                                        {data?.roles.length ? (
                                            data.roles.map(
                                                role => (
                                                    <button
                                                        type="button"
                                                        key={
                                                            role.id
                                                        }
                                                        onClick={() =>
                                                            editRole(
                                                                role,
                                                            )
                                                        }
                                                        className={[
                                                            'w-full rounded-[16px] border p-4 text-start transition',
                                                            editing?.id ===
                                                            role.id
                                                                ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]'
                                                                : 'border-[var(--ac-line)] hover:bg-[var(--ac-surface-soft)]',
                                                        ].join(
                                                            ' ',
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between gap-3">
                                                            <strong className="truncate text-xs">
                                                                {
                                                                    role.name
                                                                }
                                                            </strong>

                                                            <Pencil
                                                                size={
                                                                    13
                                                                }
                                                            />
                                                        </div>

                                                        <div className="mt-2 text-[9px] text-[var(--ac-text-muted)]">
                                                            {
                                                                role.permissions.length
                                                            }
                                                            {' '}
                                                            {
                                                                copy.permissions
                                                            }
                                                        </div>
                                                    </button>
                                                ),
                                            )
                                        ) : (
                                            <p className="rounded-[14px] bg-[var(--ac-surface-soft)] p-4 text-xs text-[var(--ac-text-muted)]">
                                                {
                                                    copy.noRoles
                                                }
                                            </p>
                                        )}
                                    </div>
                                </section>
                            </aside>
                        </div>

                        
                    </>
                )}
            </main>

            <ConfirmDialog
                open={
                    promotionConfirmOpen
                }
                title={
                    copy.confirmPromotion
                }
                description={
                    selectedMember
                    && selectedRole
                        ? `${selectedMember.user.name}: ${memberRoleLabel(selectedMember)} → ${selectedRole.name}`
                        : ''
                }
                confirmLabel={
                    copy.promote
                }
                tone="positive"
                busy={
                    busy
                }
                onCancel={() =>
                    setPromotionConfirmOpen(
                        false,
                    )
                }
                onConfirm={() =>
                    void promoteMember()
                }
            />

            <ConfirmDialog
                open={
                    Boolean(
                        revoking,
                    )
                }
                title={
                    copy.revoke
                }
                description={`${revoking?.user.name ?? ''} — ${copy.revokeHelp}`}
                confirmLabel={
                    copy.revoke
                }
                tone="danger"
                busy={
                    busy
                }
                onCancel={() =>
                    setRevoking(
                        null,
                    )
                }
                onConfirm={() =>
                    void revokeMember()
                }
            />
        </AppShell>
    );
}

function MemberAccessMatrix({
    members,
    roles,
    permissionKeys,
    ar,
    busy,
    onEditRole,
    onAssign,
    onRevoke,
}: {
    members: Member[];
    roles: Role[];
    permissionKeys: string[];
    ar: boolean;
    busy: boolean;
    onEditRole: (role: Role) => void;
    onAssign: (member: Member) => void;
    onRevoke: (member: Member) => void;
}) {
    const [
        query,
        setQuery,
    ] = useState('');

    const [
        selectedId,
        setSelectedId,
    ] = useState<number | null>(
        members[0]?.id
        ?? null,
    );

    useEffect(() => {
        if (
            selectedId !== null
            && members.some(
                member =>
                    member.id ===
                    selectedId,
            )
        ) {
            return;
        }

        setSelectedId(
            members[0]?.id
            ?? null,
        );
    }, [
        members,
        selectedId,
    ]);

    const filtered =
        useMemo(
            () => {
                const needle =
                    query
                        .trim()
                        .toLowerCase();

                if (! needle) {
                    return members;
                }

                return members.filter(
                    member =>
                        member.user.name
                            .toLowerCase()
                            .includes(needle)
                        || member.user.email
                            .toLowerCase()
                            .includes(needle)
                        || (
                            member.role_name
                            ?? member.role
                        )
                            .toLowerCase()
                            .includes(needle),
                );
            },
            [
                members,
                query,
            ],
        );

    const selected =
        members.find(
            member =>
                member.id ===
                selectedId,
        )
        ?? filtered[0]
        ?? null;

    const selectedRole =
        selected?.workspace_role_id
            ? roles.find(
                role =>
                    role.id ===
                    selected.workspace_role_id,
            )
            : null;

    const accessLabel = (
        member: Member,
    ): string => {
        if (
            member.access_mode ===
            'full'
        ) {
            return ar
                ? 'وصول كامل للنظام'
                : 'Full system access';
        }

        if (
            member.access_mode ===
            'custom'
        ) {
            return ar
                ? 'صلاحيات من دور مخصص'
                : 'Custom role permissions';
        }

        return ar
            ? 'صلاحيات موروثة من الدور النظامي'
            : 'Built-in role permissions';
    };

    const roleLabel = (
        member: Member,
    ): string =>
        member.role_name
        ?? (
            member.role === 'owner'
                ? (
                    ar
                        ? 'مالك مساحة العمل'
                        : 'Workspace Owner'
                )
                : member.role === 'admin'
                    ? (
                        ar
                            ? 'مدير النظام'
                            : 'Administrator'
                    )
                    : memberRoleLabel(
                        member,
                    )
        );

    const selectedPermissions =
        new Set(
            selected
                ?.effective_permissions
                ?? [],
        );

    const reportAccess =
        selected
            ? (
                selectedPermissions.has(
                    'finance.sales.view',
                )
                || selectedPermissions.has(
                    'finance.purchases.view',
                )
                || selectedPermissions.has(
                    'finance.cash.view',
                )
            )
            : false;

    const systemAreas =
        selected
            ? [
                {
                    key: 'dashboard',
                    label: ar
                        ? 'لوحة التحكم'
                        : 'Dashboard',
                    allowed: true,
                    note: ar
                        ? 'المحتوى يتكيّف حسب صلاحيات الموديولات.'
                        : 'Content adapts to module permissions.',
                },
                {
                    key: 'reports',
                    label: ar
                        ? 'التقارير وReport Studio'
                        : 'Reports & Report Studio',
                    allowed: reportAccess,
                    note: ar
                        ? 'يتطلب وصولًا ماليًا للبيانات المستخدمة.'
                        : 'Requires finance data access.',
                },
                {
                    key: 'scheduled_reports',
                    label: ar
                        ? 'إدارة التقارير المجدولة'
                        : 'Manage scheduled reports',
                    allowed:
                        reportAccess
                        && [
                            'owner',
                            'admin',
                            'manager',
                        ].includes(
                            selected.role,
                        )
                        && selected.access_mode !==
                            'custom',
                    note: ar
                        ? 'الإدارة حاليًا مرتبطة بالدور النظامي Owner/Admin/Manager.'
                        : 'Management currently follows built-in Owner/Admin/Manager roles.',
                },
                {
                    key: 'settings',
                    label: ar
                        ? 'إعدادات مساحة العمل'
                        : 'Workspace settings',
                    allowed: [
                        'owner',
                        'admin',
                    ].includes(
                        selected.role,
                    ),
                    note: ar
                        ? 'مقصورة حاليًا على Owner وAdmin.'
                        : 'Currently limited to Owner and Admin.',
                },
                {
                    key: 'roles',
                    label: ar
                        ? 'إدارة الأدوار والصلاحيات'
                        : 'Roles & permissions',
                    allowed:
                        selected.role ===
                        'owner',
                    note: ar
                        ? 'مقصورة على مالك مساحة العمل.'
                        : 'Workspace Owner only.',
                },
                {
                    key: 'team_space',
                    label: ar
                        ? 'مساحة الفريق'
                        : 'Team space',
                    allowed: true,
                    note: ar
                        ? 'متاحة لأعضاء مساحة العمل، مع صلاحيات داخلية حسب السياق.'
                        : 'Available to workspace members with contextual controls.',
                },
            ]
            : [];

    return (
        <section className="rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)] sm:p-6">
            <div className="flex flex-col gap-3 border-b border-[var(--ac-line)] pb-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                        <Users size={19} />
                    </span>

                    <div>
                        <h2 className="text-lg font-bold text-[var(--ac-text)]">
                            {ar
                                ? 'الأعضاء والصلاحيات الفعلية'
                                : 'Members & effective access'}
                        </h2>

                        <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[var(--ac-text-muted)]">
                            {ar
                                ? 'اختر أي مستخدم لترى بالضبط ما يستطيع الوصول إليه داخل كل موديول، ومصدر هذه الصلاحيات.'
                                : 'Select any user to see exactly what they can access in each module and where that access comes from.'}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 text-[9px] font-semibold">
                    <span className="rounded-full border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 py-1.5 text-[var(--ac-text-soft)]">
                        {members.length}{' '}
                        {ar
                            ? 'عضو'
                            : 'members'}
                    </span>

                    <span className="rounded-full border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 py-1.5 text-[var(--ac-text-soft)]">
                        {permissionKeys.length}{' '}
                        {ar
                            ? 'صلاحية مسجلة'
                            : 'registered permissions'}
                    </span>
                </div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
                <aside className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-3">
                    <div className="relative">
                        <Search
                            size={14}
                            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
                        />

                        <input
                            className={fieldClass + ' ps-9'}
                            value={query}
                            onChange={event =>
                                setQuery(
                                    event.target.value,
                                )
                            }
                            placeholder={
                                ar
                                    ? 'ابحث بالاسم أو البريد أو الدور...'
                                    : 'Search name, email or role...'
                            }
                        />
                    </div>

                    <div className="mt-3 max-h-[620px] space-y-2 overflow-auto pe-1">
                        {filtered.map(
                            member => {
                                const active =
                                    selected?.id ===
                                    member.id;

                                return (
                                    <button
                                        key={member.id}
                                        type="button"
                                        onClick={() =>
                                            setSelectedId(
                                                member.id,
                                            )
                                        }
                                        className={[
                                            'flex w-full items-center gap-3 rounded-[14px] border p-3 text-start transition',
                                            active
                                                ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]'
                                                : 'border-[var(--ac-line)] bg-[var(--ac-surface)] hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)]',
                                        ].join(' ')}
                                    >
                                        <span className={[
                                            'flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                                            member.full_access
                                                ? 'bg-amber-500/10 text-amber-500'
                                                : 'bg-[var(--ac-surface-soft)] text-[var(--ac-accent)]',
                                        ].join(' ')}>
                                            {member.user.name
                                                .charAt(0)
                                                .toUpperCase()}
                                        </span>

                                        <span className="min-w-0 flex-1">
                                            <strong className="block truncate text-xs text-[var(--ac-text)]">
                                                {member.user.name}
                                            </strong>

                                            <span className="mt-1 block truncate text-[9px] text-[var(--ac-text-muted)]">
                                                {roleLabel(member)}
                                            </span>
                                        </span>

                                        <span className="rounded-full border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2 py-1 text-[8px] font-bold text-[var(--ac-text-soft)]">
                                            {member.full_access
                                                ? (
                                                    ar
                                                        ? 'كامل'
                                                        : 'Full'
                                                )
                                                : member.permission_count}
                                        </span>
                                    </button>
                                );
                            },
                        )}

                        {filtered.length === 0 && (
                            <p className="rounded-[14px] border border-dashed border-[var(--ac-line)] px-4 py-8 text-center text-[10px] text-[var(--ac-text-muted)]">
                                {ar
                                    ? 'لا يوجد عضو مطابق للبحث.'
                                    : 'No member matches your search.'}
                            </p>
                        )}
                    </div>
                </aside>

                {selected ? (
                    <div className="min-w-0">
                        <div className="flex flex-col gap-4 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                                <span className={[
                                    'flex size-12 shrink-0 items-center justify-center rounded-[15px]',
                                    selected.full_access
                                        ? 'bg-amber-500/10 text-amber-500'
                                        : 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]',
                                ].join(' ')}>
                                    {selected.full_access ? (
                                        <Crown size={20} />
                                    ) : (
                                        <ShieldCheck size={20} />
                                    )}
                                </span>

                                <div className="min-w-0">
                                    <h3 className="truncate text-base font-bold text-[var(--ac-text)]">
                                        {selected.user.name}
                                    </h3>

                                    <p className="mt-1 truncate text-[10px] text-[var(--ac-text-muted)]">
                                        {selected.user.email}
                                    </p>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <span className="rounded-full border border-[var(--ac-line)] bg-[var(--ac-surface)] px-2.5 py-1 text-[9px] font-bold text-[var(--ac-text-soft)]">
                                            {roleLabel(selected)}
                                        </span>

                                        <span className={[
                                            'rounded-full border px-2.5 py-1 text-[9px] font-bold',
                                            selected.access_mode === 'custom'
                                                ? 'border-[var(--ac-accent)]/25 bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                                                : selected.full_access
                                                    ? 'border-amber-500/25 bg-amber-500/10 text-amber-500'
                                                    : 'border-[var(--ac-line)] bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]',
                                        ].join(' ')}>
                                            {accessLabel(selected)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {selected.role !== 'owner' && (
                                <div className="flex flex-wrap gap-2">
                                    {selectedRole && (
                                        <button
                                            type="button"
                                            className={secondaryButton}
                                            onClick={() =>
                                                onEditRole(
                                                    selectedRole,
                                                )
                                            }
                                        >
                                            <Pencil size={13} />
                                            {ar
                                                ? 'تعديل الدور'
                                                : 'Edit role'}
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        className={primaryButton}
                                        onClick={() =>
                                            onAssign(
                                                selected,
                                            )
                                        }
                                    >
                                        <UserCog size={13} />
                                        {ar
                                            ? 'تغيير الدور'
                                            : 'Change role'}
                                    </button>

                                    <button
                                        type="button"
                                        disabled={busy}
                                        className="inline-flex min-h-10 items-center justify-center rounded-[13px] border border-red-500/20 px-3 text-[10px] font-semibold text-red-500 transition hover:bg-red-500/10 disabled:opacity-40"
                                        onClick={() =>
                                            onRevoke(
                                                selected,
                                            )
                                        }
                                    >
                                        {ar
                                            ? 'إلغاء الوصول'
                                            : 'Revoke'}
                                    </button>
                                </div>
                            )}
                        </div>

                        <section className="mt-4 rounded-[17px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-4">
                            <div className="flex items-start gap-2.5">
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                                    <KeyRound size={15} />
                                </span>

                                <div>
                                    <h4 className="text-xs font-bold text-[var(--ac-text)]">
                                        {ar
                                            ? 'الوصول النظامي'
                                            : 'System access'}
                                    </h4>

                                    <p className="mt-1 text-[8px] leading-4 text-[var(--ac-text-muted)]">
                                        {ar
                                            ? 'هذه أجزاء لا تُدار كلها بمفتاح صلاحية مستقل؛ المعروض هو السلوك الفعلي الحالي للنظام.'
                                            : 'These areas are not all controlled by standalone permission keys; this reflects current system behavior.'}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {systemAreas.map(
                                    area => (
                                        <div
                                            key={area.key}
                                            className={[
                                                'rounded-[12px] border p-3',
                                                area.allowed
                                                    ? 'border-emerald-500/20 bg-emerald-500/10'
                                                    : 'border-[var(--ac-line)] bg-[var(--ac-surface)]',
                                            ].join(' ')}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <strong className="text-[9px] text-[var(--ac-text)]">
                                                    {area.label}
                                                </strong>

                                                <span
                                                    className={[
                                                        'inline-flex size-5 items-center justify-center rounded-full border',
                                                        area.allowed
                                                            ? 'border-emerald-500/25 text-emerald-500'
                                                            : 'border-[var(--ac-line)] text-[var(--ac-text-muted)]',
                                                    ].join(' ')}
                                                >
                                                    {area.allowed ? (
                                                        <Check size={10} />
                                                    ) : (
                                                        <X size={10} />
                                                    )}
                                                </span>
                                            </div>

                                            <p className="mt-2 text-[8px] leading-4 text-[var(--ac-text-muted)]">
                                                {area.note}
                                            </p>
                                        </div>
                                    ),
                                )}
                            </div>
                        </section>

                        <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            {groups.map(
                                group => {
                                    const available =
                                        group.permissions.filter(
                                            permission =>
                                                permissionKeys.includes(
                                                    permission,
                                                ),
                                        );

                                    if (
                                        available.length ===
                                        0
                                    ) {
                                        return null;
                                    }

                                    const granted =
                                        available.filter(
                                            permission =>
                                                selected
                                                    .effective_permissions
                                                    .includes(
                                                        permission,
                                                    ),
                                        );

                                    const Icon =
                                        group.icon;

                                    return (
                                        <section
                                            key={group.key}
                                            className="rounded-[17px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-4"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-start gap-2.5">
                                                    <span className={[
                                                        'flex size-9 shrink-0 items-center justify-center rounded-[11px]',
                                                        granted.length
                                                            ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                                                            : 'bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]',
                                                    ].join(' ')}>
                                                        <Icon size={15} />
                                                    </span>

                                                    <div>
                                                        <h4 className="text-xs font-bold text-[var(--ac-text)]">
                                                            {ar
                                                                ? group.titleAr
                                                                : group.titleEn}
                                                        </h4>

                                                        <p className="mt-1 text-[8px] text-[var(--ac-text-muted)]">
                                                            {granted.length}
                                                            {' / '}
                                                            {available.length}
                                                            {' '}
                                                            {ar
                                                                ? 'صلاحيات'
                                                                : 'permissions'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {granted.length ===
                                                available.length ? (
                                                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[8px] font-bold text-emerald-500">
                                                        {ar
                                                            ? 'كامل'
                                                            : 'Full'}
                                                    </span>
                                                ) : granted.length ===
                                                    0 ? (
                                                    <span className="rounded-full border border-[var(--ac-line)] px-2 py-1 text-[8px] font-bold text-[var(--ac-text-muted)]">
                                                        {ar
                                                            ? 'بدون وصول'
                                                            : 'No access'}
                                                    </span>
                                                ) : (
                                                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[8px] font-bold text-amber-500">
                                                        {ar
                                                            ? 'جزئي'
                                                            : 'Partial'}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="mt-3 flex flex-wrap gap-1.5">
                                                {available.map(
                                                    permission => {
                                                        const checked =
                                                            selected
                                                                .effective_permissions
                                                                .includes(
                                                                    permission,
                                                                );

                                                        return (
                                                            <span
                                                                key={permission}
                                                                title={permission}
                                                                className={[
                                                                    'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[8px] font-semibold',
                                                                    checked
                                                                        ? 'border-[var(--ac-accent)]/20 bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                                                                        : 'border-[var(--ac-line)] bg-[var(--ac-surface)] text-[var(--ac-text-muted)] opacity-55',
                                                                ].join(' ')}
                                                            >
                                                                {checked ? (
                                                                    <Check size={9} />
                                                                ) : (
                                                                    <X size={9} />
                                                                )}

                                                                {permissionLabel(
                                                                    permission,
                                                                    ar,
                                                                )}
                                                            </span>
                                                        );
                                                    },
                                                )}
                                            </div>
                                        </section>
                                    );
                                },
                            )}
                        </div>

                        {selected.access_mode ===
                            'built_in' && (
                            <div className="mt-4 rounded-[15px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4 text-[9px] leading-5 text-[var(--ac-text-muted)]">
                                {ar
                                    ? 'هذا العضو يستخدم دورًا نظاميًا قديمًا (Manager / Accountant / Employee). المعروض هو الوصول الموروث من سياسات النظام الحالية. لتخصيصه بدقة، عيّن له دورًا مخصصًا.'
                                    : 'This member uses a built-in legacy role (Manager / Accountant / Employee). The matrix shows access inherited from current system policies. Assign a custom role for precise control.'}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex min-h-80 items-center justify-center rounded-[18px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-bg)] text-xs text-[var(--ac-text-muted)]">
                        {ar
                            ? 'اختر عضوًا لعرض صلاحياته.'
                            : 'Choose a member to inspect access.'}
                    </div>
                )}
            </div>
        </section>
    );
}

/**
 * Render one compact summary card.
 */
function SummaryCard({
    icon:
        Icon,
    label,
    value,
}: {
    icon:
        typeof ShieldCheck;
    label: string;
    value: string;
}) {
    return (
        <div className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)]">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-[9px] font-semibold text-[var(--ac-text-muted)]">
                        {
                            label
                        }
                    </p>

                    <strong className="mt-2 block text-2xl tracking-[-0.04em]">
                        {
                            value
                        }
                    </strong>
                </div>

                <span className="flex size-11 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                    <Icon
                        size={
                            18
                        }
                    />
                </span>
            </div>
        </div>
    );
}

/**
 * Render an icon representing one role-template business category.
 */
function RoleCategoryIcon({
    category,
}: {
    category: string;
}) {
    const Icon =
        category ===
        'finance'
            ? BadgeDollarSign
            : category ===
                'inventory'
              ? Boxes
              : category ===
                  'production'
                ? Factory
                : category ===
                    'sales'
                  ? ContactRound
                  : category ===
                      'management'
                    ? BriefcaseBusiness
                    : Users;

    return (
        <span className="flex size-10 items-center justify-center rounded-[13px] bg-[var(--ac-surface)] text-[var(--ac-accent-strong)] shadow-sm">
            <Icon
                size={
                    17
                }
            />
        </span>
    );
}
