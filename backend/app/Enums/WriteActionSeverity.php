<?php

namespace App\Enums;

enum WriteActionSeverity: string
{
    case Standard = 'standard';
    case Destructive = 'destructive';
}
