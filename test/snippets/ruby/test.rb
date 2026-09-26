# frozen_string_literal: true

# Runs the shared cases in ../vectors.json against cycle_wire.rb, and, on Ruby 3,
# the Rails helper in cycle_wire_helper.rb with a stand-in for ActiveSupport's html_safe.
#
#   ruby test/snippets/ruby/test.rb

require 'json'
require 'minitest/autorun'
require_relative 'cycle_wire'

CASES = JSON.parse(File.read(File.expand_path('../vectors.json', __dir__), encoding: 'utf-8'))['cases']

class CycleWireTest < Minitest::Test
  CASES.each_with_index do |c, index|
    define_method(format('test_%03d %s', index, c['name'])) do
      options = c['options'].map { |name, value| [name.to_sym, value] }.to_h
      if c['error']
        assert_raises(ArgumentError) { CycleWire.cw(c['action'], c['props'], options) }
      else
        assert_equal c['expected'], CycleWire.cw(c['action'], c['props'], options)
      end
    end
  end

  def test_symbol_keys_in_props
    assert_equal 'cw-action="cart#add" cw-props="{&quot;sku&quot;:&quot;wire-01&quot;}"',
                 CycleWire.cw('cart#add', { sku: 'wire-01' })
  end

  def test_options_as_keywords
    assert_equal 'cw-action="menu" cw-trigger="idle"', CycleWire.cw('menu', nil, trigger: 'idle')
  end

  def test_an_action_that_is_not_a_string
    [nil, 42, :cart].each do |action|
      assert_raises(ArgumentError) { CycleWire.cw(action) }
    end
  end
end

# Stands in for ActiveSupport, which gives every String #html_safe.
class SafeString < String
  def html_safe?
    true
  end
end

class String
  def html_safe
    SafeString.new(self)
  end
end

class CycleWireHelperTest < Minitest::Test
  def setup
    skip 'the Rails helper uses Ruby 3 syntax' if RUBY_VERSION < '3'
    require_relative 'cycle_wire_helper'
    @view = Object.new.extend(CycleWireHelper)
  end

  def test_props_and_keyword_options
    html = @view.cw('cart#add', { sku: 'wire-01' }, trigger: 'visible')
    assert_equal 'cw-action="cart#add" cw-props="{&quot;sku&quot;:&quot;wire-01&quot;}" cw-trigger="visible"', html
    assert_predicate html, :html_safe?
  end

  def test_options_without_props
    assert_equal 'cw-on-keydown="search#keys"', @view.cw('search#keys', on: 'keydown')
  end

  def test_props_without_braces_are_options
    assert_raises(ArgumentError) { @view.cw('cart#add', sku: 'wire-01') }
  end
end
