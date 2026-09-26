# frozen_string_literal: true

# <button <%= cw('cart#add', { sku: @sku }, trigger: 'visible') %>> in any view.
# From https://github.com/CycleChain/CycleWire/blob/main/docs/server-helpers.md (MIT).
module CycleWireHelper
  # CycleWire.cw has escaped every value, so the result is marked safe to print.
  def cw(action, props = nil, **options) = CycleWire.cw(action, props, options).html_safe
end
