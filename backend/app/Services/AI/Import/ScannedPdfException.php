<?php

namespace App\Services\AI\Import;

use RuntimeException;

/**
 * Thrown by `PdfRowExtractor::extract()` when the uploaded PDF has no
 * selectable text layer (i.e. it is a scan). This is a dedicated type,
 * distinct from the generic `RuntimeException` used elsewhere in the
 * extractor, so the controller can surface this exception's message to
 * the user verbatim: it is always this fixed, app-authored string, never
 * a wrapped third-party exception whose message could leak internal
 * library detail.
 */
class ScannedPdfException extends RuntimeException
{
    //
}
