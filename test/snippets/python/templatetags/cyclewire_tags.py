"""{% cw %}: CycleWire attributes in Django templates.

    {% load cyclewire_tags %}
    <button {% cw 'cart#add' props trigger='visible' %}>Add to cart</button>

From https://github.com/CycleChain/CycleWire/blob/main/docs/server-helpers.md (MIT).
"""

from django import template
from django.utils.safestring import mark_safe

from .. import cyclewire

register = template.Library()


@register.simple_tag
def cw(action, props=None, **options):
    # cyclewire.cw() has escaped every value, so the result is safe to print.
    return mark_safe(cyclewire.cw(action, props, **options))
