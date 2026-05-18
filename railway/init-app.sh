#!/bin/bash

# Make sure this file has executable permissions, run `chmod +x railway/init-app.sh`

# Exit the script if any command fails
set -e

# Run migrations
php artisan migrate --force

# Seed initial data (idempotent — safe to run on every deploy)
php artisan db:seed --force

# Clear stale bootstrap/file caches — these never need a Redis connection
php artisan config:clear
php artisan route:clear
php artisan view:clear
php artisan event:clear
# cache:clear contacts the configured cache driver (Redis); non-fatal so a
# missing/unconfigured Redis doesn't abort the startup sequence
php artisan cache:clear || true

# Cache config, routes, events and views for performance
php artisan config:cache
php artisan event:cache
php artisan route:cache
php artisan view:cache
