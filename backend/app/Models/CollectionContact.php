<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\CollectionContactFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The collections log: who contacted a customer about money, how, and what
 * came of it. Entered by a person; never created by an automatic send.
 */
class CollectionContact extends Model
{
    /** @use HasFactory<CollectionContactFactory> */
    use BelongsToOrganization;

    use HasFactory;

    public const OUTCOMES = ['reached', 'no_answer', 'promised', 'refused', 'other'];

    protected $fillable = ['party_id', 'user_id', 'channel', 'outcome', 'note', 'contacted_at', 'next_contact_on'];

    protected function casts(): array
    {
        return ['contacted_at' => 'datetime', 'next_contact_on' => 'date'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
