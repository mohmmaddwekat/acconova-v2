<?php

namespace App\Enums;

/**
 * Where a catalog item is meant to be used: sold to customers, bought from
 * suppliers, or both. It decides which prices apply and which invoices offer it.
 */
enum ProductUsage: string
{
    case Sale = 'sale';
    case Purchase = 'purchase';
    case Both = 'both';
}
