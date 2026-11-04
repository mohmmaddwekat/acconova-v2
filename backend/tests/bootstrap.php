<?php

require __DIR__.'/../vendor/autoload.php';

/*
 * Every checkout and terminal shares one MySQL test database, and each test
 * class rebuilds its schema. Two runs at once drop each other's tables and
 * fail at random. An OS-level lock in the system temp directory makes the
 * second run wait for the first instead, regardless of which worktree or
 * session started it. The lock is released automatically when the process ends.
 */
$connection = $_ENV['DB_CONNECTION'] ?? $_SERVER['DB_CONNECTION'] ?? getenv('DB_CONNECTION');

if ($connection === 'mysql') {
    $lock = fopen(sys_get_temp_dir().DIRECTORY_SEPARATOR.'acconova-mysql-tests.lock', 'c');

    if ($lock !== false) {
        if (! flock($lock, LOCK_EX | LOCK_NB)) {
            fwrite(STDERR, "Another test run is using the MySQL test database; waiting for it to finish...\n");
            flock($lock, LOCK_EX);
        }

        $GLOBALS['acconova_mysql_test_lock'] = $lock;
    }
}
