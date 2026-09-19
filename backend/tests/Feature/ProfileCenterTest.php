<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class ProfileCenterTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_guests_cannot_read_profile_center(): void
    {
        $this->getJson('/api/profile/center')->assertUnauthorized();
    }

    public function test_upload_is_private_persisted_and_downloadable(): void
    {
        Storage::fake('local');
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/profile/files', [
            'file' => UploadedFile::fake()->createWithContent('notes.txt', 'Private notes'),
            'category' => 'work',
        ])->assertCreated()->assertJsonPath('name', 'notes.txt')->assertJsonMissingPath('path');

        $this->assertDatabaseHas('profile_files', ['id' => $response->json('id'), 'user_id' => $user->id, 'category' => 'work']);
        $path = DB::table('profile_files')->where('id', $response->json('id'))->value('path');
        Storage::disk('local')->assertExists($path);
        $this->get($response->json('download_url'))->assertDownload('notes.txt')->assertStreamedContent('Private notes');
    }

    public function test_other_accounts_cannot_list_download_or_modify_files(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $file = $this->storedFile($owner);

        $this->actingAs($other)->getJson('/api/profile/center')->assertOk()->assertJsonCount(0, 'files');
        $this->getJson('/api/profile/files/'.$file.'/download')->assertNotFound();
        $this->patchJson('/api/profile/files/'.$file, ['favorite' => true])->assertNotFound();
        $this->assertDatabaseHas('profile_files', ['id' => $file, 'favorite' => false]);
    }

    public function test_owner_can_favorite_pin_and_recategorize_without_changing_ownership(): void
    {
        $user = User::factory()->create();
        $file = $this->storedFile($user);

        $this->actingAs($user)->patchJson('/api/profile/files/'.$file, [
            'favorite' => true, 'pinned' => true, 'category' => 'certificates', 'user_id' => 999,
        ])->assertOk()->assertJsonPath('favorite', true)->assertJsonPath('pinned', true);

        $this->assertDatabaseHas('profile_files', ['id' => $file, 'user_id' => $user->id, 'category' => 'certificates', 'favorite' => true, 'pinned' => true]);
    }

    public function test_upload_rejects_executable_files_with_422(): void
    {
        Storage::fake('local');
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/profile/files', [
            'file' => UploadedFile::fake()->createWithContent('unsafe.php', '<?php echo "unsafe";'), 'category' => 'personal',
        ])->assertUnprocessable()->assertJsonValidationErrors('file');

        $this->assertDatabaseCount('profile_files', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_upload_rejects_oversized_files_with_422(): void
    {
        Storage::fake('local');
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/profile/files', [
            'file' => UploadedFile::fake()->create('large.pdf', 51201, 'application/pdf'), 'category' => 'personal',
        ])->assertUnprocessable()->assertJsonValidationErrors('file');

        $this->assertDatabaseCount('profile_files', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_missing_file_and_invalid_category_return_422(): void
    {
        $this->actingAs(User::factory()->create())->postJson('/api/profile/files', ['category' => 'shared'])
            ->assertUnprocessable()->assertJsonValidationErrors(['file', 'category']);
        $this->assertDatabaseCount('profile_files', 0);
    }

    public function test_preferences_are_saved_only_for_the_authenticated_user(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $settings = $this->settings();

        $this->actingAs($user)->putJson('/api/profile/preferences', [...$settings, 'user_id' => $other->id])
            ->assertOk()->assertJsonPath('settings.timezone', 'Asia/Hebron')->assertJsonMissingPath('settings.user_id');
        $this->getJson('/api/profile/center')->assertOk()->assertJsonPath('settings.page_size', 25);
        $this->actingAs($other)->getJson('/api/profile/center')->assertOk()->assertJsonPath('settings', null);

        $this->assertDatabaseHas('profile_preferences', ['user_id' => $user->id]);
        $this->assertDatabaseMissing('profile_preferences', ['user_id' => $other->id]);
    }

    #[TestWith(['locale', 'fr'])]
    #[TestWith(['timezone', 'invalid'])]
    #[TestWith(['page_size', 1000])]
    #[TestWith(['density', 'unknown'])]
    #[TestWith(['theme', 'unknown'])]
    #[TestWith(['reduced_motion', 'yes'])]
    #[TestWith(['date_format', 'unknown'])]
    #[TestWith(['hour_cycle', 'h99'])]
    #[TestWith(['week_start', 'friday'])]
    public function test_invalid_preferences_return_422_without_saving(string $key, mixed $value): void
    {
        $this->actingAs(User::factory()->create())->putJson('/api/profile/preferences', [...$this->settings(), $key => $value])
            ->assertUnprocessable()->assertJsonValidationErrors($key);
        $this->assertDatabaseCount('profile_preferences', 0);
    }

    /** @return array{locale: string, timezone: string, date_format: string, hour_cycle: string, week_start: string, density: string, reduced_motion: bool, page_size: int, theme: string} */
    private function settings(): array
    {
        return ['locale' => 'ar', 'timezone' => 'Asia/Hebron', 'date_format' => 'numeric', 'hour_cycle' => 'h12', 'week_start' => 'sunday', 'density' => 'comfortable', 'reduced_motion' => false, 'page_size' => 25, 'theme' => 'light'];
    }

    private function storedFile(User $user): int
    {
        return DB::table('profile_files')->insertGetId([
            'user_id' => $user->id, 'name' => 'private.txt', 'path' => 'profile-files/private.txt',
            'category' => 'personal', 'extension' => 'txt', 'size' => 20, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
