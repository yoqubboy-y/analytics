FROM composer:2 AS composer-build

WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install \
    --no-dev \
    --no-scripts \
    --no-interaction \
    --optimize-autoloader \
    --prefer-dist

FROM php:8.3-cli-alpine AS node-build

RUN apk add --no-cache nodejs npm && npm install -g pnpm@9

WORKDIR /app

COPY . .
COPY --from=composer-build /app/vendor ./vendor

# Set APP_KEY directly via PHP — no artisan, no framework boot, no OOM risk
RUN cp .env.example .env \
    && mkdir -p bootstrap/cache storage/framework/{sessions,views,cache} storage/logs database \
    && touch database/database.sqlite \
    && php -r "file_put_contents('.env', str_replace('APP_KEY=', 'APP_KEY=base64:'.base64_encode(random_bytes(32)), file_get_contents('.env')));"

# Generate wayfinder TypeScript route/action files (gitignored, must be created at build time)
# SESSION/CACHE/QUEUE overrides prevent any accidental DB table lookups during app boot
RUN SESSION_DRIVER=array CACHE_STORE=array QUEUE_CONNECTION=sync \
    php artisan wayfinder:generate --with-form

RUN pnpm install --no-frozen-lockfile
RUN NODE_OPTIONS="--max-old-space-size=512" DOCKER_BUILD=1 pnpm run build

FROM php:8.3-fpm-alpine

WORKDIR /app

# Pull built assets FIRST — forces BuildKit to wait for node-build to finish
# before starting extension compilation, preventing parallel stage OOM kill
COPY --from=node-build /app/public/build ./public/build

# MAKEFLAGS=-j1 caps GCC to one thread at a time, cutting peak memory ~4x
RUN apk add --no-cache \
    nginx \
    supervisor \
    curl \
    zip \
    unzip \
    libpq-dev \
    libzip-dev \
    && MAKEFLAGS="-j1" docker-php-ext-install bcmath pdo_pgsql pcntl zip \
    && rm -rf /var/cache/apk/*

COPY . .
COPY --from=composer-build /app/vendor ./vendor

RUN mkdir -p storage/framework/{sessions,views,cache} \
             storage/logs \
             bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

COPY railway/php-fpm.conf /usr/local/etc/php-fpm.d/www.conf
COPY railway/nginx.conf /etc/nginx/nginx.conf
COPY railway/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
