# frozen_string_literal: true

# CycleWire attributes for server-rendered HTML: CycleWire.cw('cart#add', { sku: sku }).
# From https://github.com/CycleChain/CycleWire/blob/main/docs/server-helpers.md (MIT).

require 'json'

module CycleWire
  ACTION = /\A[A-Za-z0-9_.-]+(?:#[A-Za-z0-9_$]*)?\z/
  EVENT = /\A[a-z][a-z0-9:_-]*\z/
  PREFIX = /\A(?:[a-z0-9-]*-)?\z/
  # Options printed after the action and props, in this order, with the strings
  # they accept. debounce takes an Integer instead, and once only true.
  OPTIONS = {
    trigger: /\A(?:load|idle|visible|media:.+)\z/m,
    preload: /\A(?:intent|visible|idle|load|none)\z/,
    concurrency: /\A(?:drop|restart|latest|parallel)\z/,
    debounce: nil,
    once: nil,
    prevent: /\A[a-z][a-z0-9:_-]*(?: [a-z][a-z0-9:_-]*)*\z/
  }.freeze
  ESCAPES = { '&' => '&amp;', '"' => '&quot;', "'" => '&#39;', '<' => '&lt;', '>' => '&gt;' }.freeze

  # The attributes, escaped for HTML, to print inside a start tag.
  # CycleWire.cw('cart#add', { sku: 'wire-01' }, trigger: 'visible') returns
  # data-cw-action="cart#add" data-cw-props="{&quot;sku&quot;:&quot;wire-01&quot;}" data-cw-trigger="visible"
  # Raises ArgumentError for a bad name, option or value.
  def self.cw(action, props = nil, options = {})
    options.each_key do |name|
      next if OPTIONS.key?(name) || name == :on || name == :prefix

      raise ArgumentError, "CycleWire: unknown option #{name.inspect}"
    end
    raise ArgumentError, "CycleWire: invalid action #{action.inspect}" unless action.is_a?(String) && ACTION.match?(action)

    # nil and false leave an option out, so values can come straight from variables.
    options = options.reject { |_, value| value.nil? || value == false }
    prefix = options.fetch(:prefix, 'cw-')
    raise ArgumentError, "CycleWire: invalid prefix #{prefix.inspect}" unless prefix.is_a?(String) && PREFIX.match?(prefix)

    on = options[:on]
    raise ArgumentError, "CycleWire: invalid on #{on.inspect}" unless on.nil? || (on.is_a?(String) && EVENT.match?(on))

    binds = on.nil? ? 'action' : "on-#{on}"
    attributes = { "data-#{prefix}#{binds}" => action }
    attributes["data-#{prefix}props"] = JSON.generate(props) unless props.nil?
    OPTIONS.each_key do |name|
      next unless options.key?(name)

      value = options[name]
      raise ArgumentError, "CycleWire: invalid #{name} #{value.inspect}" unless valid?(name, value)

      attributes["data-#{prefix}#{name}"] = value == true ? nil : value.to_s
    end
    attributes.map { |name, value| value.nil? ? name : %(#{name}="#{value.gsub(/[&"'<>]/, ESCAPES)}") }.join(' ')
  end

  def self.valid?(name, value)
    return %i[once prevent].include?(name) if value == true
    return value.is_a?(Integer) && value >= 0 if name == :debounce

    value.is_a?(String) && !OPTIONS[name].nil? && OPTIONS[name].match?(value)
  end
  private_class_method :valid?
end
