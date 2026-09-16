<?php

return [
    'parties' => [
        'title' => 'العملاء والموردون',

        'generated_at' => 'تاريخ الإنشاء',

        'workspace' => 'مساحة العمل',

        'total' => 'إجمالي السجلات',

        'types' => [
            'person' => 'شخص',
            'company' => 'شركة',
        ],

        'roles' => [
            'customer' => 'عميل',
            'supplier' => 'مورد',
        ],

        'columns' => [
            'type' => 'النوع',
            'name' => 'الاسم',
            'roles' => 'العلاقة',
            'email' => 'البريد الإلكتروني',
            'phone' => 'رقم الهاتف',
            'tax_number' => 'الرقم الضريبي',
            'address' => 'العنوان',
            'city' => 'المدينة',
            'state' => 'المنطقة',
            'postal_code' => 'الرمز البريدي',
            'country' => 'الدولة',
            'created_at' => 'تاريخ الإضافة',
        ],
    ],

    'products' => [
        'title' => 'المنتجات والخدمات',

        'generated_at' => 'تاريخ الإنشاء',

        'workspace' => 'مساحة العمل',

        'total' => 'إجمالي عناصر الكتالوج',

        'types' => [
            'product' => 'منتج',
            'service' => 'خدمة',
        ],

        'lifecycle' => [
            'active' => 'نشط',
            'archived' => 'مؤرشف',
        ],

        'columns' => [
            'type' => 'النوع',
            'name' => 'الاسم',
            'sku' => 'رمز SKU',
            'description' => 'الوصف',
            'unit' => 'الوحدة',
            'unit_price' => 'سعر البيع',
            'cost_price' => 'التكلفة',
            'tax_rate' => 'نسبة الضريبة',
            'status' => 'الحالة',
            'created_at' => 'تاريخ الإضافة',
        ],
    ],
];
