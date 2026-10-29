"""Run with:  python3 -m unittest discover tests -v"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402


def new_block(exam, n, topic, text='What should you do?', options=('Alpha', 'Beta'), extra=''):
    slug = exam.lower().replace(' ', '-')
    opts = '\n\n'.join(f'**{chr(65 + i)}:** {o}' for i, o in enumerate(options))
    return (
        f'## Examtopics {exam}_1 question #{n}\n\n{text}\n\n{opts}\n\n{extra}\n\n**Answer: A**\n\n'
        f'**Timestamp: 2020-01-01 10:00:00**\n\n'
        f'[View on ExamTopics](https://www.examtopics.com/discussions/google/view/{n}-exam-{slug}-topic-{topic}-question-{n}/)\n\n'
        f'Comments: [bob] Selected Answer: A fine'
    )


def old_block(exam, topic, n):
    slug = exam.lower().replace(' ', '-')
    return (
        f'## Exam {exam} topic {topic} question {n} discussion\n\nQuestion text here?\n\nA. One\nB. Two\n\n'
        f'[View on ExamTopics](https://www.examtopics.com/discussions/google/view/9-exam-{slug}-topic-{topic}-question-{n}-discussion/)\n\n'
        f'Comments: nothing'
    )


def parse(*blocks):
    with tempfile.NamedTemporaryFile('w', suffix='.md', delete=False, encoding='utf-8') as f:
        f.write('# Exam\n\n' + '\n-----------\n'.join(blocks))
    try:
        return server.parse_md(f.name)
    finally:
        os.unlink(f.name)


class Ordering(unittest.TestCase):
    def test_sorted_by_topic_then_number(self):
        qs = parse(new_block('Cloud Architect', 3, 9), new_block('Cloud Architect', 95, 1),
                   new_block('Cloud Architect', 4, 9), new_block('Cloud Architect', 17, 1))
        self.assertEqual([(q['topic'], q['question_number']) for q in qs], [(1, 17), (1, 95), (9, 3), (9, 4)])

    def test_old_format_still_parses_with_topic(self):
        qs = parse(old_block('Data Engineer', 1, 2), old_block('Data Engineer', 1, 1))
        self.assertEqual([q['question_number'] for q in qs], [1, 2])
        self.assertEqual(qs[0]['exam_name'], 'Data Engineer')


class Identity(unittest.TestCase):
    def test_simple_uid_when_numbers_are_unique(self):
        qs = parse(new_block('Cloud Architect', 1, 1), new_block('Cloud Architect', 2, 1))
        self.assertEqual([q['uid'] for q in qs], ['1-1', '1-2'])

    def test_uid_includes_exam_when_two_exams_share_numbers(self):
        qs = parse(new_block('Cloud Engineer', 1, 1), new_block('Data Practitioner', 1, 1))
        self.assertEqual(len({q['uid'] for q in qs}), 2)
        self.assertTrue(all(q['multi_exam'] for q in qs))
        self.assertEqual({q['exam_name'] for q in qs}, {'Cloud Engineer', 'Data Practitioner'})

    def test_exams_are_kept_apart_in_order(self):
        qs = parse(new_block('Zeta Exam', 1, 1), new_block('Alpha Exam', 1, 1), new_block('Zeta Exam', 2, 1))
        self.assertEqual([q['exam_name'] for q in qs], ['Alpha Exam', 'Zeta Exam', 'Zeta Exam'])


class Groups(unittest.TestCase):
    def case(self, name, n, topic):
        return new_block('Cloud Architect', n, topic, f'For this question, refer to the {name} case study. What should you do?')

    def test_single_topic_exam_has_no_groups(self):
        qs = parse(new_block('Cloud Architect', 1, 1), new_block('Cloud Architect', 2, 1))
        self.assertTrue(all(q['group_kind'] is None for q in qs))

    def test_case_study_named_from_question_text(self):
        qs = parse(new_block('Cloud Architect', 1, 1), self.case('TerramEarth', 1, 2), self.case('TerramEarth', 2, 2))
        g = [q for q in qs if q['topic'] == 2]
        self.assertTrue(all(q['group_kind'] == 'case_study' and q['group_name'] == 'TerramEarth' for q in g))
        self.assertIsNone([q for q in qs if q['topic'] == 1][0]['group_kind'])

    def test_most_common_name_wins(self):
        qs = parse(new_block('Cloud Architect', 1, 1), self.case('Alpha Corp', 1, 2), self.case('Alpha Corp', 2, 2),
                   self.case('Beta Corp', 3, 2))
        self.assertEqual({q['group_name'] for q in qs if q['topic'] == 2}, {'Alpha Corp'})

    def test_same_name_in_two_topics_is_numbered(self):
        qs = parse(new_block('Cloud Architect', 1, 1), self.case('TerramEarth', 1, 2), self.case('TerramEarth', 1, 3))
        names = {q['topic']: q['group_name'] for q in qs if q['topic'] > 1}
        self.assertEqual(names, {2: 'TerramEarth', 3: 'TerramEarth (2)'})

    def test_unnamed_topics_become_case_studies_when_siblings_are_named(self):
        qs = parse(new_block('Cloud Architect', 1, 1), self.case('TerramEarth', 1, 2),
                   new_block('Cloud Architect', 1, 3, 'Considering the business requirements, what now?'))
        t3 = [q for q in qs if q['topic'] == 3][0]
        self.assertEqual((t3['group_kind'], t3['group_name']), ('case_study', None))

    def test_extra_topics_stay_plain_topics_without_any_case_study_hint(self):
        qs = parse(new_block('Some Exam', 1, 1), new_block('Some Exam', 1, 2))
        t2 = [q for q in qs if q['topic'] == 2][0]
        self.assertEqual((t2['group_kind'], t2['group_name']), ('topic', None))


class CompanyNames(unittest.TestCase):
    def ordinary(self, n):
        return new_block('Cloud Architect', n, 1, f'You use Compute Engine and Cloud Storage to build service number {n}. What should you do?')

    def company(self, text, n, topic):
        return new_block('Cloud Architect', n, topic, text)

    def test_company_named_without_the_words_case_study(self):
        qs = parse(*[self.ordinary(i) for i in range(1, 8)],
                   self.company('For this question, refer to the Alpha case study. Pick a Compute Engine size.', 1, 2),
                   self.company('Mountkirk Games needs a Compute Engine deployment tool. What now?', 1, 3),
                   self.company("Mountkirk Games' servers do not scale. Use Compute Engine?", 2, 3),
                   self.company('You deploy for Mountkirk Games on Compute Engine. What should you do?', 3, 3))
        t3 = {q['group_name'] for q in qs if q['topic'] == 3}
        self.assertEqual(t3, {'Mountkirk Games'})

    def test_product_names_used_in_ordinary_questions_are_not_picked(self):
        qs = parse(*[self.ordinary(i) for i in range(1, 8)],
                   self.company('For this question, refer to the Alpha case study. Why?', 1, 2),
                   self.company('Use Compute Engine and Cloud Storage here. What now?', 1, 3),
                   self.company('Use Compute Engine and Cloud Storage there. Why?', 2, 3))
        self.assertIsNone([q for q in qs if q['topic'] == 3][0]['group_name'])

    def test_no_guess_when_no_group_is_a_case_study(self):
        qs = parse(*[self.ordinary(i) for i in range(1, 5)],
                   self.company('Zenith Bank uses Foo. What now?', 1, 2), self.company('Zenith Bank uses Bar. Why?', 2, 2))
        self.assertEqual([q['group_kind'] for q in qs if q['topic'] == 2], ['topic', 'topic'])
        self.assertIsNone([q for q in qs if q['topic'] == 2][0]['group_name'])


class QuestionText(unittest.TestCase):
    def test_whole_stem_is_kept_not_just_the_last_line(self):
        (q,) = parse(new_block('Cloud Architect', 1, 1,
                               'Your company has decided to revise its API. They need two versions.\n\nWhat should they do?'))
        self.assertIn('Your company has decided', q['question'])
        self.assertTrue(q['question'].endswith('What should they do?'))
        self.assertIn('\n', q['question'])

    def test_case_study_name_is_found_on_the_first_line_of_a_longer_stem(self):
        qs = parse(new_block('Cloud Architect', 1, 1),
                   new_block('Cloud Architect', 1, 2, 'For this question, refer to the TerramEarth case study. You need X.\nConsidering the requirements, what now?'))
        self.assertEqual([q['group_name'] for q in qs if q['topic'] == 2], ['TerramEarth'])

    def test_old_format_preamble_is_not_part_of_the_question(self):
        block = ('## Exam Data Engineer topic 1 question 4 discussion\n\nActual exam question from\n\nGoogle\'s\nData Engineer\n\n'
                 'Question #: 4\nTopic #: 1\n\n[All Data Engineer Questions]\n\nYou create a report. What should you do?\n\n'
                 'A. One\n\nB. Two\n\n[View on ExamTopics](https://www.examtopics.com/discussions/google/view/1-exam-data-engineer-topic-1-question-4/)\n\nComments: x')
        (q,) = parse(block)
        self.assertEqual(q['question'], 'You create a report. What should you do?')

    def test_exhibit_images_are_split_from_the_text(self):
        url = 'https://www.examtopics.com/assets/media/exam-media/1/x.png'
        (q,) = parse(new_block('Cloud Architect', 1, 1, f'Look at the code below. What is wrong?\n\n{url}'))
        self.assertEqual(q['question'], 'Look at the code below. What is wrong?')
        self.assertEqual(q['question_images'], [url])


class ImageOptions(unittest.TestCase):
    def test_image_options_are_kept_with_their_urls(self):
        base = 'https://www.examtopics.com/assets/media/exam-media/1/'
        text = ('## Examtopics Cloud Architect_1 question #5\n\nWhich command should you use?\nA.\n//IMG//\n\nB.\n//IMG//\n\n'
                f'{base}a.png\n{base}b.png\n\n**Answer: A**\n\n[View on ExamTopics](https://www.examtopics.com/discussions/google/view/1-exam-cloud-architect-topic-1-question-5/)\n\nComments: none')
        (q,) = parse(text)
        self.assertEqual(sorted(q['options']), ['A', 'B'])
        self.assertEqual(q['option_images'], {'A': base + 'a.png', 'B': base + 'b.png'})

    def test_text_questions_have_no_images(self):
        (q,) = parse(new_block('Cloud Architect', 1, 1))
        self.assertEqual(q['option_images'], {})


class RealFiles(unittest.TestCase):
    """Only runs for exam files present on this machine."""

    def test_every_local_exam_has_unique_ids_and_is_sorted(self):
        d = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'exams')
        files = [f for f in os.listdir(d) if f.endswith('.md')] if os.path.isdir(d) else []
        if not files:
            self.skipTest('no exam files in exams/')
        for f in files:
            with self.subTest(file=f):
                qs = server.parse_md(os.path.join(d, f))
                self.assertEqual(len({q['uid'] for q in qs}), len(qs))
                keys = [(q['exam_name'].lower(), q['topic'], q['question_number']) for q in qs]
                self.assertEqual(keys, sorted(keys))


if __name__ == '__main__':
    unittest.main()
