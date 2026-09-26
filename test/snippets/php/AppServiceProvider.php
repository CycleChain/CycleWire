<?php

namespace App\Providers;

use Illuminate\Support\Facades\Blade;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        // <button @cw('cart#add', ['sku' => $sku])>: cw() has escaped every value,
        // so the directive echoes its result as it is, without {{ }}.
        Blade::directive('cw', fn (string $expression) => "<?php echo \\CycleWire\\cw({$expression}); ?>");
    }
}
