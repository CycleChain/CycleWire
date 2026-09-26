"""Runs the shared cases in ../vectors.json against cyclewire.py, and renders the
Django tag in templatetags/ when Django is installed (the test is skipped otherwise).

    python3 test/snippets/python/test_cyclewire.py
"""

import json
import pathlib
import sys
import types
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import cyclewire  # noqa: E402

try:
    import django
except ImportError:
    django = None

CASES = json.loads((HERE.parent / 'vectors.json').read_text(encoding='utf-8'))['cases']


class VectorTest(unittest.TestCase):
    def test_vectors(self):
        for case in CASES:
            with self.subTest(case['name']):
                if case.get('error'):
                    with self.assertRaises(ValueError):
                        cyclewire.cw(case['action'], case['props'], **case['options'])
                else:
                    self.assertEqual(cyclewire.cw(case['action'], case['props'], **case['options']), case['expected'])

    def test_python_values(self):
        # Tuples are lists, and bool is never an integer, even though Python says it is one.
        self.assertEqual(cyclewire.cw('pick', (1, 2)), 'data-cw-action="pick" data-cw-props="[1,2]"')
        with self.assertRaises(ValueError):
            cyclewire.cw('search', debounce=True)
        with self.assertRaises(ValueError):
            cyclewire.cw('cart', once=1)

    def test_props_json_cannot_hold(self):
        with self.assertRaises(TypeError):
            cyclewire.cw('cart', {'when': object()})
        with self.assertRaises(ValueError):
            cyclewire.cw('cart', {'ratio': float('nan')})

    def test_an_action_that_is_not_a_string(self):
        for action in (None, 42, b'cart'):
            with self.subTest(action=action), self.assertRaises(ValueError):
                cyclewire.cw(action)


@unittest.skipIf(django is None, 'Django is not installed')
class DjangoTagTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from django.conf import settings

        # This directory stands in for an installed app, "shop": cyclewire.py next
        # to templatetags/, as the docs lay it out.
        shop = types.ModuleType('shop')
        shop.__path__ = [str(HERE)]
        sys.modules['shop'] = shop
        settings.configure(
            INSTALLED_APPS=['shop'],
            TEMPLATES=[{'BACKEND': 'django.template.backends.django.DjangoTemplates'}],
        )
        django.setup()

    def render(self, source, **context):
        from django.template import Context, Template

        return Template('{% load cyclewire_tags %}' + source).render(Context(context))

    def test_props_and_keyword_options(self):
        html = self.render(
            "<button {% cw 'cart#add' props trigger='visible' once=True %}>Add</button>",
            props={'sku': 'wire-01', 'name': 'Say "hi" <3'},
        )
        self.assertEqual(
            html,
            '<button data-cw-action="cart#add"'
            ' data-cw-props="{&quot;sku&quot;:&quot;wire-01&quot;,&quot;name&quot;:&quot;Say \\&quot;hi\\&quot; &lt;3&quot;}"'
            ' data-cw-trigger="visible" data-cw-once>Add</button>',
        )

    def test_on_and_integers(self):
        html = self.render("<input {% cw 'search#keys' on='keydown' debounce=200 %}>")
        self.assertEqual(html, '<input data-cw-on-keydown="search#keys" data-cw-debounce="200">')

    def test_values_from_the_context(self):
        html = self.render("<div {% cw 'menu' None trigger=when %}></div>", when=None)
        self.assertEqual(html, '<div data-cw-action="menu"></div>')

    def test_errors_reach_the_view(self):
        with self.assertRaises(ValueError):
            self.render("<a {% cw '../evil' %}></a>")


if __name__ == '__main__':
    unittest.main()
