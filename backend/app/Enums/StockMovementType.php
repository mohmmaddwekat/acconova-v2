<?php

namespace App\Enums;

enum StockMovementType: string
{
    case Opening = 'opening';
    case ProductionIn = 'production_in';
    case ProductionOut = 'production_out';

    case Adjustment = 'adjustment';

    case TransferOut = 'transfer_out';

    case TransferIn = 'transfer_in';

    case Sale = 'sale';

    case Purchase = 'purchase';

    case CustomerReturn = 'customer_return';

    case SupplierReturn = 'supplier_return';
}
