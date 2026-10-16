import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_index import allowed,chunks,PageParser,literal

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
    def test_escape(self):
        self.assertEqual(literal("Autor d'Água"),"'Autor d''Água'")

if __name__=='__main__':unittest.main()
