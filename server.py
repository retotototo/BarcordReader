import http.server
import socketserver
import os
import sys
import webbrowser
import threading

PORT = 8000

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

def open_browser():
    try:
        webbrowser.open(f"http://localhost:{PORT}")
    except Exception:
        pass

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(base_dir)
    socketserver.TCPServer.allow_reuse_address = True

    try:
        with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
            print("=" * 60)
            print("  CodeReader ローカルサーバーが起動しました")
            print("=" * 60)
            print(f"  👉 URL: http://localhost:{PORT}")
            print("=" * 60)
            print("  ※ 終了するには Ctrl + C を押してください")
            print("=" * 60)
            
            threading.Timer(1.0, open_browser).start()
            httpd.serve_forever()
    except OSError as e:
        if "address already in use" in str(e).lower() or e.errno == 10048:
            print(f"\n[注意] ポート {PORT} は既に使用されています。")
            print(f"ブラウザで http://localhost:{PORT} を開いてください。\n")
        else:
            print(f"\n[エラー] サーバー起動に失敗しました: {e}\n")
    except KeyboardInterrupt:
        print("\nサーバーを停止しました。")
