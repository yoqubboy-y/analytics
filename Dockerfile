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

# Install pnpm via corepack
RUN apk add --no-cache nodejs npm && corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy full app + vendor so `php artisan` works
COPY . .
COPY --from=composer-build /app/vendor ./vendor

# Stub .env so Laravel can boot during build
RUN cp .env.example .env && php artisan key:generate --no-interaction

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --no-frozen-lockfile
RUN pnpm run build

# ──────────────────────────────────────────────
# Stage 3: Final runtime image
# ──────────────────────────────────────────────
FROM php:8.3-fpm-alpine

# Install system dependencies and PHP extensions
RUN apk add --no-cache \
    nginx \
    supervisor \
    curl \
    zip \
    unzip \
    git \
    oniguruma-dev \
    libpng-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    libzip-dev \
    icu-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install \
        bcmath \
        ctype \
        dom \
        fileinfo \
        gd \
        intl \
        mbstring \
        opcache \
        pdo \
        pdo_mysql \
        pdo_pgsql \
        pcntl \
        tokenizer \
        xml \
        zip \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy app source
COPY . .

# Copy vendor from composer stage
COPY --from=composer-build /app/vendor ./vendor

# Copy built frontend assets from node stage
COPY --from=node-build /app/public/build ./public/build

# Set storage/bootstrap permissions
RUN mkdir -p storage/framework/{sessions,views,cache} \
             storage/logs \
             bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

# PHP-FPM config
COPY railway/php-fpm.conf /usr/local/etc/php-fpm.d/www.conf

# Nginx config
COPY railway/nginx.conf /etc/nginx/nginx.conf

# Supervisor config (manages nginx + php-fpm)
COPY railway/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
