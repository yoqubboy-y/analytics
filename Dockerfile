# ──────────────────────────────────────────────
# Stage 1: PHP – install composer dependencies
# ──────────────────────────────────────────────
FROM composer:2 AS composer-build

WORKDIR /app

COPY composer.json composer.lock ./
RUN composer install \
    --no-dev \
    --no-scripts \
    --no-interaction \
    --optimize-autoloader \
    --prefer-dist

# ──────────────────────────────────────────────
# Stage 2: Node + PHP – build frontend assets
# (PHP is needed because Wayfinder calls `php artisan`)
# ──────────────────────────────────────────────
FROM php:8.3-cli-alpine AS node-build

RUN apk add --no-cache nodejs npm && npm install -g pnpm@9

WORKDIR /app

COPY . .
COPY --from=composer-build /app/vendor ./vendor

RUN cp .env.example .env \
    && mkdir -p bootstrap/cache storage/framework/{sessions,views,cache} storage/logs \
    && php artisan key:generate --no-interaction

RUN pnpm install --no-frozen-lockfile
RUN DOCKER_BUILD=1 pnpm run build

# ──────────────────────────────────────────────
# Stage 3: Final runtime image
# Uses Alpine pre-built php83-* packages — no C compilation
# ──────────────────────────────────────────────
FROM alpine:3.21

RUN apk add --no-cache \
    php83 \
    php83-fpm \
    php83-bcmath \
    php83-ctype \
    php83-curl \
    php83-dom \
    php83-fileinfo \
    php83-gd \
    php83-iconv \
    php83-intl \
    php83-mbstring \
    php83-opcache \
    php83-openssl \
    php83-pdo \
    php83-pdo_mysql \
    php83-pdo_pgsql \
    php83-pcntl \
    php83-phar \
    php83-session \
    php83-sodium \
    php83-tokenizer \
    php83-xml \
    php83-xmlwriter \
    php83-zip \
    nginx \
    supervisor \
    curl \
    zip \
    unzip \
    && ln -sf /usr/bin/php83 /usr/bin/php \
    && addgroup -g 82 -S www-data \
    && adduser -u 82 -D -S -G www-data www-data

WORKDIR /app

COPY . .
COPY --from=composer-build /app/vendor ./vendor
COPY --from=node-build /app/public/build ./public/build

RUN mkdir -p storage/framework/{sessions,views,cache} \
             storage/logs \
             bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

COPY railway/php-fpm.conf /etc/php83/php-fpm.d/www.conf
COPY railway/nginx.conf /etc/nginx/nginx.conf
COPY railway/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
