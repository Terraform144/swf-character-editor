"""Local server for the SWF character editor.

Serves editor.html and exposes POST /export: receives the baked animation
JSON from the editor and returns (and saves) a .swf built with swf_exporter.

Run:  python editor_server.py
Open: http://localhost:8765
"""
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from swf_exporter import export_project  # noqa: E402

PORT = 8765


def safe_name(name):
    n = re.sub(r'[^A-Za-z0-9_\-. ]+', '_', str(name or 'character')).strip() or 'character'
    return n[:64]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))

    def do_GET(self):
        if self.path in ('/', '/editor.html', '/index.html'):
            path = os.path.join(HERE, 'editor.html')
        else:
            rel = os.path.normpath(self.path.lstrip('/'))
            if rel.startswith('..') or os.path.isabs(rel):
                self.send_error(403, 'Forbidden')
                return
            path = os.path.join(HERE, rel)
            if not os.path.isfile(path):
                self.send_error(404, 'Not found')
                return
        ext = os.path.splitext(path)[1].lower()
        ctype = {'.html': 'text/html; charset=utf-8',
                 '.js': 'application/javascript; charset=utf-8',
                 '.css': 'text/css; charset=utf-8',
                 '.json': 'application/json'}.get(ext, 'application/octet-stream')
        with open(path, 'rb') as f:
            data = f.read()
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != '/export':
            self.send_error(404, 'Not found')
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            project = json.loads(self.rfile.read(length).decode('utf-8'))
            frames = project.get('frames') or []
            if not frames:
                raise ValueError('animation has no frames')
            name = safe_name(project.get('name'))
            swf = export_project(project)

            outdir = os.path.join(HERE, 'exports')
            os.makedirs(outdir, exist_ok=True)
            out = os.path.join(outdir, name + '.swf')
            with open(out, 'wb') as f:
                f.write(swf)
            print('exported %s (%d bytes, %d frames)'
                  % (out, len(swf), len(frames)), file=sys.stderr)

            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Disposition',
                             'attachment; filename="%s.swf"' % name)
            self.send_header('X-Saved-Path', out)
            self.send_header('Content-Length', str(len(swf)))
            self.end_headers()
            self.wfile.write(swf)
        except Exception as e:
            body = ('export failed: %s' % e).encode('utf-8')
            self.send_response(400)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)


def main():
    server = HTTPServer(('127.0.0.1', PORT), Handler)
    print('SWF Character Editor')
    print('  serving editor:  http://localhost:%d' % PORT)
    print('  export endpoint:  POST /export  (used by the editor)')
    print('  exports saved to: %s' % os.path.join(HERE, 'exports'))
    print('  Ctrl+C to stop.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nbye')


if __name__ == '__main__':
    main()
