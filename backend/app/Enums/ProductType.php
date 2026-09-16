<?php

namespace App\Enums;

enum ProductType: string
{
    case Product = 'product';
    case RawMaterial = 'raw_material';
    case Service = 'service';
}
