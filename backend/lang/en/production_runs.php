<?php

return [
    'production_run_outputs_required' => 'Add at least one finished Product to this production run.',

    'production_run_not_draft' => 'Only a Draft production run can be edited or deleted.',

    'production_run_must_be_posted' => 'Only a Posted production run can be reversed.',

    'production_run_product_invalid' => 'Production outputs must be finished Products.',

    'production_run_material_invalid' => 'A production input is no longer a valid Raw Material.',

    'production_run_inventory_not_tracked' => 'Inventory tracking must be enabled for every produced Product and consumed Raw Material.',

    'production_run_recipe_invalid' => 'The selected recipe does not belong to this finished Product.',

    'production_run_source_invalid' => 'One of the Raw Material source warehouses does not match a recipe component.',

    'production_run_quantity_positive' => 'Production and material quantities must be greater than zero.',

    'production_run_quantity_overflow' => 'This production run would exceed the supported Inventory quantity range.',

    'production_run_insufficient_material' => 'The production run requires more available Raw Material than is currently available.',

    'production_run_movements_missing' => 'The posted production movements could not be found.',

    'production_run_already_reversed' => 'This production run already has reversal movements.',

    'production_run_reversal_output_unavailable' => 'The run cannot be reversed because some produced stock is no longer available or is reserved.',

    'production_run_reversal_archived_warehouse' => 'Restore the affected warehouse before reversing this production run.',
];
