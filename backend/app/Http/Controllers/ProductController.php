<?php

namespace App\Http\Controllers;

use App\Actions\Products\CreateProduct;
use App\Actions\Products\DeleteProduct;
use App\Actions\Products\RestoreProduct;
use App\Actions\Products\UpdateProduct;
use App\Http\Requests\DeleteProductRequest;
use App\Http\Requests\IndexProductRequest;
use App\Http\Requests\RestoreProductRequest;
use App\Http\Requests\ShowProductRequest;
use App\Http\Requests\StoreProductRequest;
use App\Http\Requests\UpdateProductRequest;
use App\Http\Resources\ProductResource;
use App\Queries\Products\ProductIndexQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class ProductController extends Controller
{
    /**
     * Return the searchable tenant-scoped catalog.
     */
    public function index(
        IndexProductRequest $request,
        ProductIndexQuery $productIndexQuery,
    ): AnonymousResourceCollection {
        return ProductResource::collection(
            $productIndexQuery->execute(
                $request->validated(),
            ),
        );
    }

    /**
     * Return one authorized active catalog item.
     */
    public function show(
        ShowProductRequest $request,
    ): JsonResponse {
        return (
            new ProductResource(
                $request->product(),
            )
        )->response();
    }

    /**
     * Create one Product or Service.
     */
    public function store(
        StoreProductRequest $request,
        CreateProduct $createProduct,
    ): JsonResponse {
        $product =
            $createProduct->execute(
                $request->validated(),
            );

        return (
            new ProductResource(
                $product,
            )
        )
            ->response()
            ->setStatusCode(
                201,
            );
    }

    /**
     * Update one active catalog item.
     */
    public function update(
        UpdateProductRequest $request,
        UpdateProduct $updateProduct,
    ): JsonResponse {
        $product =
            $updateProduct->execute(
                $request->product(),
                $request->validated(),
                $request->user()?->id,
            );

        return (
            new ProductResource(
                $product,
            )
        )->response();
    }

    /**
     * Archive one Product or Service.
     */
    public function destroy(
        DeleteProductRequest $request,
        DeleteProduct $deleteProduct,
    ): Response {
        $deleteProduct->execute(
            $request->product(),
        );

        return response()
            ->noContent();
    }

    /**
     * Restore one archived catalog item.
     */
    public function restore(
        RestoreProductRequest $request,
        RestoreProduct $restoreProduct,
    ): JsonResponse {
        $product =
            $restoreProduct->execute(
                $request->product(),
            );

        return (
            new ProductResource(
                $product,
            )
        )->response();
    }
}
