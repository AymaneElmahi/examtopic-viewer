"""Run with:  python3 -m unittest discover tests -v"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402


def first_event(response):
    body = response.get_data(as_text=True)
    return json.loads(body.split('data: ', 1)[1].split('\n\n', 1)[0])


class DownloadInput(unittest.TestCase):
    def setUp(self):
        self.client = server.app.test_client()

    def test_spaces_and_capitals_become_a_slug(self):
        self.assertEqual(server._normalize_query('  Professional Cloud   Architect '), 'professional-cloud-architect')
        self.assertEqual(server._normalize_query('200-301'), '200-301')

    def test_bad_input_is_reported_as_a_stream_event_the_browser_can_read(self):
        for query in ('bad/query', 'a;b', ''):
            with self.subTest(query=query):
                r = self.client.get('/api/download', query_string={'provider': 'google', 'query': query})
                self.assertEqual(r.status_code, 200)
                self.assertTrue(r.mimetype.startswith('text/event-stream'))
                self.assertIn('error', first_event(r))

    def test_unknown_provider_is_reported_the_same_way(self):
        r = self.client.get('/api/download', query_string={'provider': 'nope', 'query': 'x'})
        self.assertTrue(r.mimetype.startswith('text/event-stream'))
        self.assertEqual(first_event(r)['error'], 'Unknown provider.')


if __name__ == '__main__':
    unittest.main()
