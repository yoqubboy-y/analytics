#!/bin/bash

# Make sure this file has executable permissions, run `chmod +x railway/init-app.sh`

# Exit the script if any command fails
set -e

# Run migrations
php artisan migrate --force

# Seed initial data (idempotent — safe to run on every deploy)
php artisan db:seed --force

# Clear any stale cache
php artisan optimize:clear

# Cache config, routes, events and views for performance
php artisan config:cache
php artisan event:cache
php artisan route:cache
php artisan view:cache
