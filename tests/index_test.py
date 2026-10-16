import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_index import allowed,chunks,PageParser,literal,write_sql,ROOT

class IndexTests(unittest.TestCase):
    def test_allowlist(self):
        self.assertTrue(allowed('https://mortesubita.net/magia-do-caos/teste/'))
        self.assertFalse(allowed('https://mortesubita.net.evil.org/foo'))
        self.assertFalse(allowed('http://mortesubita.net/'))
    def test_article_extraction(self):
        page=PageParser()
        page.feed('<html><head><title>Teste</title></head><body><header>menu</header><article><div class="entry-content"><p>Texto sobre magia e hermetismo</p><p>Outra passagem de estudo</p></div></article><footer>rodapé</footer></body></html>')
        title,body=page.parsed()
        self.assertEqual(title,'Teste')
        self.assertIn('magia',body)
        self.assertNotIn('menu',body)
    def test_chunks(self):
        parts=list(chunks('Texto sobre hermetismo. '*200))
        self.assertGreater(len(parts),1)
        self.assertLessEqual(max(map(len,parts)),1450)
    def test_remote_sql_files_have_no_explicit_transactions(self):
        # Wrangler D1 executa cada arquivo em uma transação própria.
        import re
        base = Path(__file__).resolve().parents[1]
        files = [base / 'data' / 'seed.sql', *sorted((base / 'imports').glob('videos_*.sql'))]
        self.assertEqual(len(files), 17)
        for path in files:
            sql = path.read_text(encoding='utf-8')
            self.assertNotRegex(sql, r'(?im)^\s*(?:BEGIN(?:\s+TRANSACTION)?|COMMIT|SAVEPOINT|RELEASE)\s*;')
            self.assertIn('INSERT INTO ', sql)
    def test_sql_generator_excludes_transaction_wrappers(self):
        import tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as dirname:
            with patch('build_index.ROOT', Path(dirname)):
                files=write_sql('fixture', ["INSERT INTO example VALUES (1);"])
                self.assertEqual(len(files),1)
                self.assertEqual(files[0].read_text(encoding='utf-8'),"INSERT INTO example VALUES (1);\n")
    def test_escape(self):
        self.assertEqual(literal("Autor d'Água"),"'Autor d''Água'")

if __name__=='__main__':unittest.main()
