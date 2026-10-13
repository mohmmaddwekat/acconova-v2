<?php

namespace Tests\Unit;

use App\Enums\WriteActionSeverity;
use PHPUnit\Framework\TestCase;

class WriteActionSeverityTest extends TestCase
{
    /**
     * Verify the severity enum exposes exactly the Standard and Destructive cases, in order.
     */
    public function test_enum_has_exactly_two_cases(): void
    {
        $this->assertSame(
            ['Standard', 'Destructive'],
            array_map(fn (WriteActionSeverity $case): string => $case->name, WriteActionSeverity::cases()),
        );
    }
}
