<?php

return [
    'unexpected' => 'Something went wrong. Please try again.',
    'session' => 'Your session has expired. Please sign in again.',
    'forbidden' => "You don't have permission to perform this action.",
    'not_found' => 'This record is no longer available.',
    'conflict' => 'This action conflicts with the current record. Refresh and try again.',
    'file' => 'Please choose a valid spreadsheet.',
    'validation' => 'Please review the highlighted fields.',
    'throttled' => 'Too many requests. Please wait a moment and try again.',

    'invalid' => 'Please check this value.',
    'required' => 'This field is required.',
    'unique' => 'This value is already in use.',
    'sku' => 'This SKU is already used by another catalog item.',
    'email' => 'A relationship with this email already exists in this workspace.',

    'password_reuse' => 'Your new password must be different from your current password.',

    'permanent_delete_requires_archive' => 'Archive this record before deleting it permanently.',
    'permanent_delete_blocked' => 'This record cannot be deleted permanently because protected business records still reference it. Archive it instead.',

    'warehouse_default_archive_blocked' => 'Choose another default warehouse before archiving this warehouse.',
    'warehouse_stock_archive_blocked' => 'Move or adjust this warehouse stock to zero before archiving it.',
    'product_stock_archive_blocked' => 'Move or adjust this product inventory to zero before archiving it.',

    'inventory_tracking_products_only' => 'Inventory tracking is available only for physical Products.',
    'inventory_tracking_disable_stock_blocked' => 'Move or adjust all Product stock to zero before turning inventory tracking off.',
    'inventory_not_tracked' => 'Enable inventory tracking for this Product before changing stock.',
    'inventory_quantity_positive' => 'Enter a stock quantity greater than zero.',
    'inventory_adjustment_non_zero' => 'The stock adjustment cannot be zero.',
    'inventory_insufficient_stock' => 'There is not enough available stock for this operation.',
    'inventory_reserved_stock_blocked' => 'This operation would reduce stock below the reserved quantity.',
    'inventory_transfer_same_warehouse' => 'Choose two different warehouses for a stock transfer.',
    'opening_stock_history_blocked' => 'Opening stock can be recorded only before this Product has stock history in the selected warehouse.',

    'return' => 'Return to your workspace',

    'import_invalid' => 'Review the values in this spreadsheet row.',
    'import_duplicate' => 'This value appears more than once in the spreadsheet.',
    'import_archived' => 'Restore the archived record before importing this row.',
    'import_fix' => 'Fix the invalid spreadsheet rows before importing.',
    'import_limit' => 'This import contains more than 5,000 rows. Split it into smaller files for this version.',
    'import_mode' => 'Choose whether to skip or update duplicate records.',
];
