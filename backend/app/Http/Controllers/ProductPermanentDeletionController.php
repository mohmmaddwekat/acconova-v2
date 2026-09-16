<?php

namespace App\Http\Controllers;

use App\Actions\Products\ForceDeleteProduct;
use App\Http\Requests\ForceDeleteProductRequest;
use Illuminate\Http\Response;

class ProductPermanentDeletionController extends Controller
{
    /**
     * Permanently remove one authorized archived catalog record.
     */
    public function __invoke(
        ForceDeleteProductRequest $request,
        ForceDeleteProduct $forceDeleteProduct,
    ): Response {
        $forceDeleteProduct->execute(
            $request->product(),
        );

        return response()
            ->noContent();
    }
}
