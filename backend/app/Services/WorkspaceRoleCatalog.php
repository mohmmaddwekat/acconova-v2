<?php

namespace App\Services;

final class WorkspaceRoleCatalog
{
    /**
     * Return practical role templates for common business structures.
     *
     * These are starting points. The owner remains free to customize every
     * resulting custom role before or after assigning it.
     *
     * @return array<string, array{
     *     name_ar: string,
     *     name_en: string,
     *     description_ar: string,
     *     description_en: string,
     *     category: string,
     *     permissions: list<string>
     * }>
     */
    public static function presets(): array
    {
        return [
            'employee' => [
                'name_ar' => 'موظف عادي',
                'name_en' => 'Employee',
                'description_ar' => 'حساب موظف بدون صلاحيات إدارية إضافية.',
                'description_en' => 'Standard employee without extra administrative authority.',
                'category' => 'staff',
                'permissions' => [],
            ],

            'department_head' => [
                'name_ar' => 'رئيس قسم',
                'name_en' => 'Department Head',
                'description_ar' => 'يرى أعضاء قسمه ويسجل حضورهم دون الوصول لبقية الشركة.',
                'description_en' => 'Can view department members and manage their attendance.',
                'category' => 'staff',
                'permissions' => [
                    'staff.team_view',
                    'staff.team_attendance',

                    'teams.view',
                    'teams.view_workload',
                ],
            ],

            'department_manager' => [
                'name_ar' => 'مدير قسم',
                'name_en' => 'Department Manager',
                'description_ar' => 'إدارة أعضاء القسم والحضور والمستحقات الخاصة بفريقه.',
                'description_en' => 'Can manage department employees, attendance, and team payroll.',
                'category' => 'staff',
                'permissions' => [
                    'staff.team_view',
                    'staff.team_manage',
                    'staff.team_attendance',
                    'staff.team_pay',

                    'teams.view',
                    'teams.create',
                    'teams.update',
                    'teams.archive',
                    'teams.members.manage',
                    'teams.lead.manage',
                    'teams.projects.manage',
                    'teams.subteams.create',
                    'teams.subteams.manage',
                    'teams.move',
                    'teams.view_workload',
                ],
            ],

            'general_manager' => [
                'name_ar' => 'مدير عام',
                'name_en' => 'General Manager',
                'description_ar' => 'صلاحيات تشغيلية واسعة للشركة بدون امتلاك صلاحيات المالك.',
                'description_en' => 'Broad operational authority without workspace ownership.',
                'category' => 'management',
                'permissions' => [
                    'products.view',
                    'products.create',
                    'products.update',
                    'products.service',
                    'products.archive',

                    'parties.view',
                    'parties.create',
                    'parties.update',
                    'parties.archive',

                    'inventory.view',
                    'inventory.manage',

                    'production.view',
                    'production.manage',

                    'payments.view',
                    'payments.create',
                    'payments.update',
                    'payments.record',

                    'staff.view',
                    'staff.manage',
                    'staff.attendance',

                    'teams.view',
                    'teams.create',
                    'teams.update',
                    'teams.archive',
                    'teams.members.manage',
                    'teams.lead.manage',
                    'teams.projects.manage',
                    'teams.subteams.create',
                    'teams.subteams.manage',
                    'teams.move',
                    'teams.view_workload',
                ],
            ],

            'accountant' => [
                'name_ar' => 'محاسب',
                'name_en' => 'Accountant',
                'description_ar' => 'عمليات المصاريف والمدفوعات اليومية مع عرض بيانات التشغيل.',
                'description_en' => 'Daily financial operations with operational read access.',
                'category' => 'finance',
                'permissions' => [
                    'products.view',
                    'parties.view',
                    'inventory.view',

                    'payments.view',
                    'payments.create',
                    'payments.update',
                    'payments.record',
                ],
            ],

            'finance_manager' => [
                'name_ar' => 'مدير مالي',
                'name_en' => 'Finance Manager',
                'description_ar' => 'صلاحيات مالية كاملة مع الوصول لمستحقات الموظفين.',
                'description_en' => 'Full financial operations including employee payroll.',
                'category' => 'finance',
                'permissions' => [
                    'products.view',
                    'parties.view',
                    'inventory.view',

                    'payments.view',
                    'payments.create',
                    'payments.update',
                    'payments.record',

                    'staff.view',
                    'staff.pay',
                ],
            ],

            'sales_rep' => [
                'name_ar' => 'مندوب مبيعات',
                'name_en' => 'Sales Representative',
                'description_ar' => 'إدارة العملاء وتنفيذ خدمات البيع مع عرض المنتجات.',
                'description_en' => 'Customer operations and service execution with product visibility.',
                'category' => 'sales',
                'permissions' => [
                    'products.view',
                    'products.service',

                    'parties.view',
                    'parties.create',
                    'parties.update',
                ],
            ],

            'sales_manager' => [
                'name_ar' => 'مدير مبيعات',
                'name_en' => 'Sales Manager',
                'description_ar' => 'إدارة العملاء والخدمات ومتابعة فريق المبيعات.',
                'description_en' => 'Manages parties, services, and the sales department.',
                'category' => 'sales',
                'permissions' => [
                    'products.view',
                    'products.create',
                    'products.update',
                    'products.service',

                    'parties.view',
                    'parties.create',
                    'parties.update',

                    'staff.team_view',
                    'staff.team_manage',
                    'staff.team_attendance',

                    'teams.view',
                    'teams.create',
                    'teams.update',
                    'teams.members.manage',
                    'teams.lead.manage',
                    'teams.projects.manage',
                    'teams.subteams.create',
                    'teams.subteams.manage',
                    'teams.move',
                    'teams.view_workload',
                ],
            ],

            'inventory_clerk' => [
                'name_ar' => 'مسؤول مخزون',
                'name_en' => 'Inventory Clerk',
                'description_ar' => 'عرض المنتجات والمخزون دون صلاحية تغيير الأرصدة.',
                'description_en' => 'Read-only product and inventory access.',
                'category' => 'inventory',
                'permissions' => [
                    'products.view',
                    'inventory.view',
                ],
            ],

            'inventory_manager' => [
                'name_ar' => 'مدير مخزون',
                'name_en' => 'Inventory Manager',
                'description_ar' => 'إدارة المخزون والمستودعات وحركات المخزون.',
                'description_en' => 'Manages stock, warehouses, and inventory operations.',
                'category' => 'inventory',
                'permissions' => [
                    'products.view',
                    'inventory.view',
                    'inventory.manage',
                ],
            ],

            'production_supervisor' => [
                'name_ar' => 'مشرف إنتاج',
                'name_en' => 'Production Supervisor',
                'description_ar' => 'تشغيل الإنتاج مع عرض المخزون والمواد الخام.',
                'description_en' => 'Runs production with inventory visibility.',
                'category' => 'production',
                'permissions' => [
                    'products.view',
                    'inventory.view',
                    'production.view',
                    'production.manage',
                ],
            ],

            'production_manager' => [
                'name_ar' => 'مدير إنتاج',
                'name_en' => 'Production Manager',
                'description_ar' => 'إدارة الإنتاج والمخزون ومتابعة فريق قسم الإنتاج.',
                'description_en' => 'Manages production, inventory, and the production team.',
                'category' => 'production',
                'permissions' => [
                    'products.view',
                    'products.update',

                    'inventory.view',
                    'inventory.manage',

                    'production.view',
                    'production.manage',

                    'staff.team_view',
                    'staff.team_manage',
                    'staff.team_attendance',

                    'teams.view',
                    'teams.create',
                    'teams.update',
                    'teams.members.manage',
                    'teams.lead.manage',
                    'teams.projects.manage',
                    'teams.subteams.create',
                    'teams.subteams.manage',
                    'teams.move',
                    'teams.view_workload',
                ],
            ],

            'hr_officer' => [
                'name_ar' => 'مسؤول موارد بشرية',
                'name_en' => 'HR Officer',
                'description_ar' => 'إدارة ملفات الموظفين والحضور دون المستحقات المالية.',
                'description_en' => 'Employee and attendance management without payroll.',
                'category' => 'staff',
                'permissions' => [
                    'staff.view',
                    'staff.manage',
                    'staff.attendance',
                ],
            ],

            'hr_manager' => [
                'name_ar' => 'مدير موارد بشرية',
                'name_en' => 'HR Manager',
                'description_ar' => 'إدارة كاملة للموظفين والحضور والمستحقات.',
                'description_en' => 'Full employee, attendance, and payroll administration.',
                'category' => 'staff',
                'permissions' => [
                    'staff.view',
                    'staff.manage',
                    'staff.attendance',
                    'staff.pay',
                ],
            ],
        ];
    }

    /**
     * Resolve one role preset.
     *
     * @return array<string, mixed>|null
     */
    public static function preset(
        string $key,
    ): ?array {
        return self::presets()[$key]
            ?? null;
    }

    /**
     * Add required read/scope dependencies to a permission selection.
     *
     * @param  list<string>  $permissions
     * @return list<string>
     */
    public static function normalizePermissions(
        array $permissions,
    ): array {
        $normalized =
            array_values(
                array_unique(
                    $permissions,
                ),
            );

        foreach (
            $normalized as $permission
        ) {
            if (str_starts_with($permission, 'tasks.') && ! in_array($permission, ['tasks.dashboard', 'tasks.projects.view', 'tasks.team'], true)) {
                $normalized[] = 'tasks.view';
            }
            if ($permission === 'tasks.projects.manage') {
                $normalized[] = 'tasks.projects.view';
            }

            if (
                str_starts_with(
                    $permission,
                    'teams.',
                )
                && $permission !==
                'teams.view'
            ) {
                $normalized[] = 'teams.view';
            }

            if (
                $permission ===
                'teams.subteams.create'
            ) {
                $normalized[] = 'teams.create';
            }
            if (
                str_starts_with(
                    $permission,
                    'products.',
                )
                && $permission !==
                'products.view'
            ) {
                $normalized[] =
                    'products.view';
            }

            if (
                str_starts_with(
                    $permission,
                    'parties.',
                )
                && $permission !==
                'parties.view'
            ) {
                $normalized[] =
                    'parties.view';
            }

            if (
                $permission ===
                'products.service'
            ) {
                $normalized[] =
                    'parties.view';
            }

            if (
                $permission ===
                'inventory.manage'
            ) {
                $normalized[] =
                    'inventory.view';

                $normalized[] =
                    'products.view';
            }

            if (
                $permission ===
                'production.view'
            ) {
                $normalized[] =
                    'inventory.view';

                $normalized[] =
                    'products.view';
            }

            if (
                $permission ===
                'production.manage'
            ) {
                $normalized[] =
                    'production.view';

                $normalized[] =
                    'inventory.view';

                $normalized[] =
                    'products.view';
            }

            if (
                str_starts_with(
                    $permission,
                    'payments.',
                )
                && $permission !==
                'payments.view'
            ) {
                $normalized[] =
                    'payments.view';
            }

            if (
                in_array(
                    $permission,
                    [
                        'staff.manage',
                        'staff.attendance',
                        'staff.pay',
                    ],
                    true,
                )
            ) {
                $normalized[] =
                    'staff.view';
            }

            if (
                in_array(
                    $permission,
                    [
                        'staff.team_manage',
                        'staff.team_attendance',
                        'staff.team_pay',
                    ],
                    true,
                )
            ) {
                $normalized[] =
                    'staff.team_view';
            }
        }

        return array_values(
            array_unique(
                $normalized,
            ),
        );
    }
}
