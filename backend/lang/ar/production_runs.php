<?php

return [
    'production_run_outputs_required' => 'أضف منتجًا نهائيًا واحدًا على الأقل إلى عملية الإنتاج.',

    'production_run_not_draft' => 'يمكن تعديل أو حذف عملية الإنتاج عندما تكون مسودة فقط.',

    'production_run_must_be_posted' => 'يمكن عكس عملية الإنتاج بعد ترحيلها فقط.',

    'production_run_product_invalid' => 'يجب أن تكون مخرجات الإنتاج منتجات نهائية.',

    'production_run_material_invalid' => 'إحدى مدخلات الإنتاج لم تعد مادة خام صالحة.',

    'production_run_inventory_not_tracked' => 'يجب تفعيل تتبع المخزون لكل منتج يتم إنتاجه ولكل مادة خام يتم استهلاكها.',

    'production_run_recipe_invalid' => 'وصفة الإنتاج المحددة لا تخص هذا المنتج النهائي.',

    'production_run_source_invalid' => 'أحد مستودعات سحب المواد الخام غير مرتبط بمكوّن صحيح في الوصفة.',

    'production_run_quantity_positive' => 'يجب أن تكون كميات الإنتاج والمواد الخام أكبر من صفر.',

    'production_run_quantity_overflow' => 'ستتجاوز هذه العملية الحد المدعوم لكميات المخزون.',

    'production_run_insufficient_material' => 'تحتاج عملية الإنتاج إلى كمية مواد خام أكبر من الكمية المتاحة حاليًا.',

    'production_run_movements_missing' => 'تعذر العثور على حركات المخزون الأصلية لعملية الإنتاج.',

    'production_run_already_reversed' => 'تم عكس عملية الإنتاج هذه مسبقًا.',

    'production_run_reversal_output_unavailable' => 'لا يمكن عكس العملية لأن جزءًا من المنتجات الناتجة لم يعد متاحًا أو أصبح محجوزًا.',

    'production_run_reversal_archived_warehouse' => 'أعد تفعيل المستودع المتأثر قبل عكس عملية الإنتاج.',
];
