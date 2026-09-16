<?php

return [
    'parties' => [
        'title' => 'Relationships',

        'generated_at' => 'Generated at',

        'workspace' => 'Workspace',

        'total' => 'Total relationships',

        'types' => [
            'person' => 'Person',
            'company' => 'Company',
        ],

        'roles' => [
            'customer' => 'Customer',
            'supplier' => 'Supplier',
        ],

        'columns' => [
            'type' => 'Type',
            'name' => 'Name',
            'roles' => 'Relationship',
            'email' => 'Email',
            'phone' => 'Phone',
            'tax_number' => 'Tax number',
            'address' => 'Address',
            'city' => 'City',
            'state' => 'State',
            'postal_code' => 'Postal code',
            'country' => 'Country',
            'created_at' => 'Created',
        ],
    ],

    'products' => [
        'title' => 'Products & Services',

        'generated_at' => 'Generated at',

        'workspace' => 'Workspace',

        'total' => 'Total catalog items',

        'types' => [
            'product' => 'Product',
            'service' => 'Service',
        ],

        'lifecycle' => [
            'active' => 'Active',
            'archived' => 'Archived',
        ],

        'columns' => [
            'type' => 'Type',
            'name' => 'Name',
            'sku' => 'SKU',
            'description' => 'Description',
            'unit' => 'Unit',
            'unit_price' => 'Selling price',
            'cost_price' => 'Cost',
            'tax_rate' => 'Tax rate',
            'status' => 'Status',
            'created_at' => 'Created',
        ],
    ],
];
