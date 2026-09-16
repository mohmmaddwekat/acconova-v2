<?php

namespace App\Enums;

enum PartyRole: string
{
    case Customer = 'customer';
    case Supplier = 'supplier';
    case Contact = 'contact';
}
