<?php

return [
    'quantity_positive' => 'The calculated material quantity must be greater than zero and within supported precision.',
    'quantity_too_large' => 'The calculated material quantity exceeds the supported stock range.',
    'recipe_products_only' => 'Production recipes can be assigned only to finished Products.',
    'recipe_invalid_material' => 'One or more Raw Materials are no longer available.',
    'recipe_raw_materials_only' => 'Every production recipe option must reference a Raw Material.',
    'recipe_one_default' => 'Each component can have only one default Raw Material.',
    'recipe_duplicate_option' => 'The same Raw Material cannot appear twice in one component.',
    'recipe_outdated' => 'The production recipe changed. Reload the Product before recording production.',
    'recipe_invalid_option' => 'The selected Raw Material alternative does not belong to this recipe component.',
    'recipe_incompatible_unit' => 'The selected usage unit is not compatible with the Raw Material stock unit.',
];
