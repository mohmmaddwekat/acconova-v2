<?php

namespace App\Services\AI\Records;

use App\Actions\Products\CreateProduct;
use App\Actions\Products\DeleteProduct;
use App\Actions\Products\RestoreProduct;
use App\Actions\Products\UpdateProduct;
use App\Enums\ProductType;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

final class ProductRecords implements AiRecordEntity
{
    private const FIELDS = ['type', 'name', 'sku', 'description', 'unit', 'unit_price', 'cost_price', 'tax_rate'];

    public function __construct(
        private readonly CreateProduct $createProduct,
        private readonly UpdateProduct $updateProduct,
        private readonly DeleteProduct $deleteProduct,
        private readonly RestoreProduct $restoreProduct,
    ) {}

    public function key(): string
    {
        return 'product';
    }

    public function fieldHints(): array
    {
        return [
            'type' => 'product or service',
            'name' => 'text',
            'sku' => 'unique per workspace; generated when empty',
            'unit' => 'for example unit, kg, hour',
            'unit_price' => 'selling price, number',
            'cost_price' => 'number',
            'tax_rate' => 'percent, 0 to 100',
        ];
    }

    public function allowedFields(): array
    {
        return self::FIELDS;
    }

    public function normalize(array $input): array
    {
        $out = [];

        foreach (Arr::only($input, self::FIELDS) as $field => $value) {
            $text = $value === null ? '' : trim((string) $value);
            $out[$field] = $text === '' ? null : ($field === 'type' ? strtolower($text) : $text);
        }

        return $out;
    }

    public function validate(array $changes, ?Model $existing): array
    {
        $payload = $existing instanceof Product
            ? [...Arr::only($existing->getAttributes(), self::FIELDS), ...$changes]
            : $changes;

        $validator = Validator::make($payload, [
            'type' => ['required', Rule::enum(ProductType::class)],
            'name' => ['required', 'string', 'max:255'],
            'sku' => ['nullable', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:5000'],
            'unit' => ['required', 'string', 'max:50'],
            'unit_price' => ['required', 'numeric', 'min:0'],
            'cost_price' => ['nullable', 'numeric', 'min:0'],
            'tax_rate' => ['required', 'numeric', 'min:0', 'max:100'],
        ]);

        return ['errors' => $validator->errors()->toArray(), 'payload' => $payload];
    }

    public function duplicates(array $payload, ?Model $except): array
    {
        $found = [];
        $ignore = fn (Builder $query) => $except ? $query->whereKeyNot($except->getKey()) : $query;

        if (! empty($payload['sku'])) {
            $match = $ignore(Product::query()->withTrashed()->where('sku', $payload['sku']))->first();

            if ($match) {
                $found[] = ['record' => $match, 'level' => 'hard'];
            }
        }

        if (! empty($payload['name'])) {
            foreach ($ignore(Product::query()->withTrashed()->whereRaw('LOWER(name) = ?', [mb_strtolower($payload['name'])]))->limit(3)->get() as $match) {
                if (! collect($found)->contains(fn (array $hit): bool => $hit['record']->is($match))) {
                    $found[] = ['record' => $match, 'level' => 'soft'];
                }
            }
        }

        return $found;
    }

    public function candidates(string $lookup, bool $onlyTrashed): Collection
    {
        $base = fn () => $onlyTrashed ? Product::onlyTrashed() : Product::query();
        $needle = mb_strtolower(trim($lookup));

        $exact = $base()->where(fn ($query) => $query
            ->whereRaw('LOWER(sku) = ?', [$needle])
            ->orWhereRaw('LOWER(name) = ?', [$needle]))->limit(6)->get();

        if ($exact->isNotEmpty()) {
            return $exact;
        }

        $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $needle).'%';

        return $base()->where(fn ($query) => $query
            ->whereRaw('LOWER(name) LIKE ?', [$like])
            ->orWhereRaw('LOWER(sku) LIKE ?', [$like]))->limit(6)->get();
    }

    public function find(int $id, bool $onlyTrashed): ?Model
    {
        return ($onlyTrashed ? Product::onlyTrashed() : Product::query())->find($id);
    }

    public function create(array $payload, User $user): Model
    {
        return $this->createProduct->execute(Arr::only($payload, self::FIELDS));
    }

    public function update(Model $record, array $payload, User $user): Model
    {
        return $this->updateProduct->execute($record, Arr::only($payload, self::FIELDS), $user->id);
    }

    public function archive(Model $record, User $user): void
    {
        $this->deleteProduct->execute($record);
    }

    public function restore(Model $record, User $user): Model
    {
        return $this->restoreProduct->execute($record);
    }

    public function label(Model $record): string
    {
        return trim($record->name.($record->sku ? " ({$record->sku})" : ''));
    }

    public function snapshot(Model $record): array
    {
        return [
            'id' => $record->getKey(),
            ...Arr::only($record->getAttributes(), ['type', 'name', 'sku', 'unit', 'unit_price', 'cost_price', 'tax_rate']),
            'archived' => $record->trashed(),
        ];
    }
}
