<?php

namespace App\Http\Controllers\Production;

use App\Enums\OrganizationRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\DeleteProductionRunRequest;
use App\Http\Requests\PostProductionRunRequest;
use App\Http\Requests\QuickProductionRunRequest;
use App\Http\Requests\ReverseProductionRunRequest;
use App\Http\Requests\SaveProductionRunRequest;
use App\Http\Resources\ProductionRunResource;
use App\Models\ProductionRun;
use App\Services\Production\ProductionRunService;
use App\Services\Production\QuickProductionEntryService;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\Response;

class ProductionRunController extends Controller
{
    /**
     * Return searchable Production Run history.
     */
    public function index(
        Request $request,
    ): AnonymousResourceCollection {
        $this->authorizeView();

        $data =
            $request->validate([
                'archived' => ['sometimes', 'boolean'],
                'sort' => ['sometimes', 'in:occurred_on,run_number,status'],
                'direction' => ['sometimes', 'in:asc,desc'],
                'status' => [
                    'sometimes',
                    'nullable',
                    'in:draft,posted,partially_reversed,reversed',
                ],

                'search' => [
                    'sometimes',
                    'nullable',
                    'string',
                    'max:100',
                ],

                'from' => [
                    'sometimes',
                    'nullable',
                    'date_format:Y-m-d',
                ],

                'to' => [
                    'sometimes',
                    'nullable',
                    'date_format:Y-m-d',
                ],

                'per_page' => [
                    'sometimes',
                    'integer',
                    'min:10',
                    'max:100',
                ],
            ]);

        $query =
            ProductionRun::query()
                ->when(
                    (bool) ($data['archived'] ?? false),
                    fn ($builder) => $builder->onlyTrashed()->where('status', 'draft'),
                )
                ->with(
                    $this->relations(),
                )
                ->orderBy($data['sort'] ?? 'occurred_on', $data['direction'] ?? 'desc')
                ->orderBy('id', $data['direction'] ?? 'desc');

        if (! empty($data['status'])) {
            $query->where(
                'status',
                $data['status'],
            );
        }

        if (! empty($data['search'])) {
            $search =
                trim(
                    (string) $data['search'],
                );

            $query->where(
                function (
                    $builder,
                ) use (
                    $search,
                ): void {
                    $builder
                        ->where(
                            'run_number',
                            'like',
                            '%'.$search.'%',
                        )
                        ->orWhere(
                            'note',
                            'like',
                            '%'.$search.'%',
                        )
                        ->orWhereHas('outputs.product', function ($product) use ($search): void {
                            $product->where(function ($fields) use ($search): void {
                                $fields->where('name', 'like', '%'.$search.'%')
                                    ->orWhere('sku', 'like', '%'.$search.'%');
                            });
                        });
                },
            );
        }

        if (! empty($data['from'])) {
            $query->whereDate(
                'occurred_on',
                '>=',
                $data['from'],
            );
        }

        if (! empty($data['to'])) {
            $query->whereDate(
                'occurred_on',
                '<=',
                $data['to'],
            );
        }

        return ProductionRunResource::collection(
            $query->paginate(
                (int) (
                    $data['per_page']
                    ?? 25
                ),
            ),
        );
    }

    /**
     * Create one Production Draft.
     */
    public function store(
        SaveProductionRunRequest $request,
        ProductionRunService $service,
    ): JsonResponse {
        return (
            new ProductionRunResource(
                $service->createDraft(
                    $request->validated(),
                    $request->user()->id,
                ),
            )
        )
            ->response()
            ->setStatusCode(
                Response::HTTP_CREATED,
            );
    }

    /**
     * Create one Production Run per row from each Product's active Recipe.
     *
     * Posting needs an operational management role; other members get drafts.
     */
    public function quick(
        QuickProductionRunRequest $request,
        QuickProductionEntryService $quick,
    ): JsonResponse {
        $data = $request->validated();

        $canPost = in_array(
            app(TenantContext::class)->role(),
            [OrganizationRole::Owner, OrganizationRole::Admin, OrganizationRole::Manager],
            true,
        );

        $results = $quick->enter(
            $data['rows'],
            (int) $data['warehouse_id'],
            $canPost && (bool) ($data['post'] ?? false),
            $request->user()->id,
        );

        return response()->json(['data' => $results], Response::HTTP_CREATED);
    }

    /**
     * Return one Production Run.
     */
    public function show(
        string $run,
    ): ProductionRunResource {
        $this->authorizeView();

        return new ProductionRunResource(
            ProductionRun::query()
                ->with(
                    $this->relations(),
                )
                ->findOrFail(
                    $run,
                ),
        );
    }

    /**
     * Replace an editable Draft.
     */
    public function update(
        SaveProductionRunRequest $request,
        ProductionRunService $service,
        string $run,
    ): ProductionRunResource {
        return new ProductionRunResource(
            $service->updateDraft(
                ProductionRun::query()
                    ->findOrFail(
                        $run,
                    ),
                $request->validated(),
            ),
        );
    }

    /**
     * Return Recipe-vs-Actual comparison and aggregate stock availability.
     */
    public function preview(
        string $run,
        ProductionRunService $service,
    ): JsonResponse {
        $this->authorizeView();

        return response()->json([
            'data' => $service->preview(
                ProductionRun::query()
                    ->findOrFail(
                        $run,
                    ),
            ),
        ]);
    }

    /**
     * Soft-delete an unposted Draft.
     */
    public function destroy(
        DeleteProductionRunRequest $request,
        ProductionRunService $service,
        string $run,
    ): Response {
        $service->deleteDraft(
            ProductionRun::query()
                ->findOrFail(
                    $run,
                ),
            (int) $request->validated(
                'expected_revision',
            ),
        );

        return response()->noContent();
    }

    /**
     * Restore one archived Production Draft.
     */
    public function restore(
        string $run,
        ProductionRunService $service,
    ): ProductionRunResource {
        return new ProductionRunResource(
            $service->restoreDraft((int) $run),
        );
    }

    /**
     * Permanently delete one archived Production Draft.
     */
    public function forceDestroy(
        DeleteProductionRunRequest $request,
        ProductionRunService $service,
        string $run,
    ): Response {
        $service->forceDeleteDraft(
            (int) $run,
            (int) $request->validated('expected_revision'),
        );

        return response()->noContent();
    }

    /**
     * Post authoritative actual consumption to Inventory.
     */
    public function post(
        PostProductionRunRequest $request,
        ProductionRunService $service,
        string $run,
    ): ProductionRunResource {
        return new ProductionRunResource(
            $service->post(
                ProductionRun::query()
                    ->findOrFail(
                        $run,
                    ),
                (int) $request->validated(
                    'expected_revision',
                ),
                $request->user()->id,
            ),
        );
    }

    /**
     * Reverse all remaining outputs in one Production Run.
     */
    public function reverse(
        ReverseProductionRunRequest $request,
        ProductionRunService $service,
        string $run,
    ): ProductionRunResource {
        $data =
            $request->validated();

        return new ProductionRunResource(
            $service->reverseRun(
                ProductionRun::query()
                    ->findOrFail(
                        $run,
                    ),
                (int) $data['expected_revision'],
                $data['reason'],
                $request->user()->id,
            ),
        );
    }

    /**
     * Reverse one incorrect Product without rewriting other outputs.
     */
    public function reverseOutput(
        ReverseProductionRunRequest $request,
        ProductionRunService $service,
        string $run,
        string $output,
    ): ProductionRunResource {
        $data =
            $request->validated();

        return new ProductionRunResource(
            $service->reverseOutput(
                ProductionRun::query()
                    ->findOrFail(
                        $run,
                    ),
                (int) $output,
                (int) $data['expected_revision'],
                $data['reason'],
                $request->user()->id,
            ),
        );
    }

    /**
     * Return relations required by Production Run APIs.
     *
     * @return list<string>
     */
    private function relations(): array
    {
        return [
            'createdBy:id,name',
            'postedBy:id,name',
            'reversedBy:id,name',
            'outputs.product',
            'outputs.warehouse',
            'outputs.recipe',
            'outputs.postedMovement',
            'outputs.reversedBy:id,name',
            'outputs.materials.rawMaterial',
            'outputs.materials.warehouse',
        ];
    }

    /**
     * Allow all workspace roles to read production history.
     */
    private function authorizeView(): void
    {
        abort_unless(
            in_array(
                app(
                    TenantContext::class,
                )->role(),
                OrganizationRole::cases(),
                true,
            ),
            403,
        );
    }
}
