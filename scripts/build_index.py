#!/usr/bin/env python3
"""Prepara SQL para Cloudflare D1. Nunca pesquisa fora de mortesubita.net.

Comandos:
  python scripts/build_index.py videos
  python scripts/build_index.py articles --limit 40
  python scripts/build_index.py articles --limit 400 --delay 2
  python scripts/build_index.py articles --url https://mortesubita.net/algum-artigo/
Em seguida importe cada arquivo .sql em imports/ com `npx wrangler d1 execute ...`.
"""
import argparse
from html.parser import HTMLParser
import re
from pathlib import Path
import sys
import time
from urllib.parse import urlparse, urljoin, parse_qs
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.robotparser import RobotFileParser
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://mortesubita.net/'
UA = 'ManoloResearchBot/1.0 (+https://github.com/TTamosauskas/manolo; respects robots.txt)'


def allowed(url):
    p = urlparse(url)
    return p.scheme == 'https' and p.hostname in {'mortesubita.net', 'www.mortesubita.net'} and not p.username and not p.password


class RestrictRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed(newurl):
            raise ValueError(f'Redirecionamento fora do domínio permitido: {newurl}')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


OPENER = build_opener(RestrictRedirect())


def fetch(url, max_bytes=2_000_000):
    if not allowed(url):
        raise ValueError(f'URL não permitida: {url}')
    with OPENER.open(Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,application/xml,text/xml,*/*'}), timeout=18) as r:
        if not allowed(r.geturl()):
            raise ValueError('Redirecionamento proibido')
        return r.read(max_bytes + 1)[:max_bytes]


def robots():
    parser = RobotFileParser()
    parser.set_url(urljoin(SITE, 'robots.txt'))
    parser.read()
    if not parser.mtime():
        raise RuntimeError('robots.txt inacessível; abortando para não ignorar as regras do site')
    if not parser.can_fetch(UA, SITE):
        raise RuntimeError('robots.txt bloqueia o robô de indexação')
    return parser


def sitemap_urls(parser, max_urls=30000):
    pending = [urljoin(SITE, x) for x in ('wp-sitemap.xml', 'sitemap_index.xml', 'post-sitemap.xml')]
    visited = set()
    urls = []
    while pending and len(visited) < 100 and len(urls) < max_urls:
        uri = pending.pop(0)
        if uri in visited or not allowed(uri) or not parser.can_fetch(UA, uri):
            continue
        visited.add(uri)
        try:
            tree = ET.fromstring(fetch(uri))
        except Exception as exc:
            print(f'AVISO sitemap: {uri}: {exc}', file=sys.stderr)
            continue
        links = [e.text.strip() for e in tree.iter() if e.tag.split('}')[-1] == 'loc' and e.text]
        if tree.tag.endswith('sitemapindex'):
            pending.extend(x for x in links if allowed(x) and '.xml' in x)
        else:
            urls.extend(x for x in links if allowed(x) and '.xml' not in urlparse(x).path)
    return list(dict.fromkeys(urls))[:max_urls]


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.skip = 0
        self.title_depth = 0
        self.title_parts = []
        self.og_title = ''
        self.target_depth = 0
        self.article_depth = 0
        self.main_depth = 0
        self.content = []
        self.article = []
        self.main = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.stack.append(tag)
        void = tag in {'img','br','hr','input','meta','link','source','area','wbr','embed'}
        css = a.get('class', '') or ''
        if tag in {'script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript', 'form'}:
            self.skip += 1
        if tag == 'meta' and a.get('property') == 'og:title':
            self.og_title = a.get('content', '')
        if tag == 'title': self.title_depth += 1
        if tag == 'article': self.article_depth += 1
        if tag == 'main': self.main_depth += 1
        if re.search(r'(^|\s)(entry-content|post-content|article-content|wp-block-post-content)(\s|$)', css):
            self.target_depth += 1
        else:
            if self.target_depth and not void: self.target_depth += 1
    def handle_endtag(self, tag):
        if self.target_depth: self.target_depth -= 1
        if tag == 'title': self.title_depth = max(0, self.title_depth-1)
        if tag == 'article': self.article_depth=max(0,self.article_depth-1)
        if tag == 'main': self.main_depth=max(0,self.main_depth-1)
        if tag in {'script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript', 'form'}:
            self.skip = max(0, self.skip-1)
        if self.stack: self.stack.pop()
    def handle_data(self, data):
        line = ' '.join(data.split())
        if not line or self.skip: return
        if self.title_depth: self.title_parts.append(line)
        if self.target_depth: self.content.append(line)
        if self.article_depth: self.article.append(line)
        if self.main_depth: self.main.append(line)
    def parsed(self):
        title = self.og_title or ' '.join(self.title_parts).split('|')[0].strip()
        text = max((self.content, self.article, self.main), key=lambda v: (bool(v),len(' '.join(v)) if v is self.content else len(' '.join(v))/1.2))
        # Prioriza o corpo editorial. Evita incluir menus, mesmo em layouts WordPress variados.
        if self.content: text=self.content
        elif self.article: text=self.article
        else: text=self.main
        return ' '.join(title.split()).strip(), re.sub(r'\s+', ' ', ' '.join(text)).strip()


def chunks(body, size=1300, overlap=160):
    remaining = body.strip()
    while remaining:
        if len(remaining) <= size:
            yield remaining
            break
        edge = remaining.rfind('. ', int(size*.65), size)
        if edge < 0: edge = size
        else: edge += 1
        yield remaining[:edge].strip()
        remaining = remaining[max(1, edge-overlap):].strip()


def literal(s):
    if s is None: return 'NULL'
    return "'" + str(s).replace("'", "''").replace('\x00', '') + "'"


def write_sql(prefix, statements, every=100):
    output = ROOT / 'imports'
    output.mkdir(exist_ok=True)
    files=[]
    for start in range(0,len(statements),every):
        file=output/f'{prefix}_{start//every+1:03d}.sql'
        file.write_text('\n'.join(statements[start:start+every])+'\n',encoding='utf-8')
        files.append(file)
    return files


def videos():
    statements=[]
    seen=set()
    for no,line in enumerate((ROOT/'data'/'mayhem.txt').read_text(encoding='utf-8-sig').splitlines(),1):
        if not line.strip():continue
        parts=line.split('\t')
        if len(parts)!=2:raise ValueError(f'Linha {no} sem título e URL')
        title,url=(x.strip() for x in parts)
        u=urlparse(url)
        ids=parse_qs(u.query).get('v',[])
        if u.scheme!='https' or u.hostname not in {'youtube.com','www.youtube.com'} or len(ids)!=1 or not re.fullmatch(r'[A-Za-z0-9_-]{11}',ids[0]):
            raise ValueError(f'Link inválido na linha {no}: {url}')
        key=ids[0]
        if key in seen:continue
        seen.add(key)
        statements.append(f'INSERT INTO videos(id,title,url) VALUES({literal(key)},{literal(title)},{literal(url)}) ON CONFLICT(id) DO UPDATE SET title=excluded.title,url=excluded.url;')
    files=write_sql('videos',statements,100)
    print(f'Vídeos válidos: {len(seen)}; lotes gerados: {len(files)}')
    return files


def articles(args):
    rules = robots()  # Falha fechada quando não é possível confirmar as regras.
    targets = args.url or sitemap_urls(rules)
    if not targets:
        raise RuntimeError('Nenhuma URL encontrada. Passe --url com endereços específicos de artigos permitidos.')
    statements=[]
    count=0
    for url in targets:
        if count>=args.limit: break
        if not allowed(url) or not rules.can_fetch(UA,url): continue
        try:
            parser=PageParser()
            parser.feed(fetch(url).decode('utf-8','replace'))
            title,body=parser.parsed()
            if len(body)<350 or len(title)<5:continue
            body=body[:24000]
            statements.append(f'INSERT INTO articles(url,title,indexed_at) VALUES({literal(url)},{literal(title)},CURRENT_TIMESTAMP) ON CONFLICT(url) DO UPDATE SET title=excluded.title,indexed_at=CURRENT_TIMESTAMP;')
            statements.append(f'DELETE FROM article_chunks WHERE article_id=(SELECT id FROM articles WHERE url={literal(url)});')
            for i,part in enumerate(chunks(body)):
                statements.append(f'INSERT INTO article_chunks(article_id,title,body,ordinal) VALUES((SELECT id FROM articles WHERE url={literal(url)}),{literal(title)},{literal(part)},{i});')
            count+=1
            print(f'{count:04d} {title[:70]}')
        except Exception as exc:
            print(f'AVISO artigo {url}: {exc}',file=sys.stderr)
        time.sleep(max(args.delay, 1.0))
    files=write_sql('articles',statements,100)
    print(f'Artigos processados: {count}; lotes SQL: {len(files)}')
    return files


def main():
    ap=argparse.ArgumentParser(description='Indexação pública respeitando domínio e robots.txt')
    ap.add_argument('source',choices=('videos','articles'))
    ap.add_argument('--limit',type=int,default=40)
    ap.add_argument('--delay',type=float,default=2.0)
    ap.add_argument('--url',action='append',help='Artigo específico (repetível)')
    args=ap.parse_args()
    if args.source=='videos':videos()
    else:articles(args)


if __name__=='__main__':main()
