<?php

return [
    /*
     * Team Space media is private by default.
     *
     * Keep this on "local" during development. The same code can later use an
     * S3-compatible service such as Cloudflare R2 by changing TEAM_SPACE_DISK.
     */
    'disk' => env(
        'TEAM_SPACE_DISK',
        'local',
    ),

    /*
     * One message may contain several photos, videos, or audio clips without
     * allowing a single request to become an unbounded upload.
     */
    'max_files_per_message' => 5,

    /*
     * Laravel file validation uses KiB. 51200 KiB = 50 MiB per attachment.
     */
    'max_file_kb' => 51200,
];
