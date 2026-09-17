<?php

namespace App\Enums;

enum ProductionRunStatus: string
{
    case Draft = 'draft';

    case Posted = 'posted';

    case PartiallyReversed = 'partially_reversed';

    case Reversed = 'reversed';
}
