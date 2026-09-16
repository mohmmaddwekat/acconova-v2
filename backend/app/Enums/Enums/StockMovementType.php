<?php

namespace App\Enums;

enum StockMovementType: string
{
    case Opening = 'opening';

    case Adjustment = 'adjustment';

    case TransferOut = 'transfer_out';

    case TransferIn = 'transfer_in';

    case Sale = 'sale';

    case Purchase = 'purchase';

    case CustomerReturn = 'customer_return';

    case SupplierReturn = 'supplier_return';
}
