export default {
    en: {
        'lifecycle.deletePermanently':
            'Delete',

        'lifecycle.deleteProductTitle':
            'Delete this catalog item permanently?',

        'lifecycle.deleteProductDescription':
            '“{name}” will be permanently removed. AccoNova will block this action if protected business records reference it.',

        'lifecycle.deletePartyTitle':
            'Delete this relationship permanently?',

        'lifecycle.deletePartyDescription':
            '“{name}” will be permanently removed. AccoNova will block this action if invoices, payments, or other protected records reference it.',

        'lifecycle.productDeleted':
            'Catalog item deleted permanently.',

        'lifecycle.partyDeleted':
            'Relationship deleted permanently.',

        'lifecycle.generatedAutomatically':
            'Generated automatically',

        'lifecycle.assignedAfterSave':
            'Assigned when saved',

        'lifecycle.skuSequenceHelp':
            'AccoNova assigns the next SKU for this workspace. Deleted SKU numbers are never reused.',
    },

    ar: {
        'lifecycle.deletePermanently':
            'حذف نهائي',

        'lifecycle.deleteProductTitle':
            'حذف عنصر الكتالوج نهائيًا؟',

        'lifecycle.deleteProductDescription':
            'سيتم حذف “{name}” نهائيًا. سيمنع AccoNova العملية تلقائيًا إذا كانت سجلات أعمال محمية مرتبطة به.',

        'lifecycle.deletePartyTitle':
            'حذف هذه العلاقة نهائيًا؟',

        'lifecycle.deletePartyDescription':
            'سيتم حذف “{name}” نهائيًا. سيمنع AccoNova العملية إذا كانت فواتير أو دفعات أو سجلات أعمال محمية مرتبطة بها.',

        'lifecycle.productDeleted':
            'تم حذف عنصر الكتالوج نهائيًا.',

        'lifecycle.partyDeleted':
            'تم حذف العلاقة نهائيًا.',

        'lifecycle.generatedAutomatically':
            'يُنشأ تلقائيًا',

        'lifecycle.assignedAfterSave':
            'يتم تعيينه عند الحفظ',

        'lifecycle.skuSequenceHelp':
            'يعيّن AccoNova رقم SKU التالي داخل مساحة العمل. الأرقام المحذوفة لا يتم استخدامها مرة أخرى.',
    },
} as const;
