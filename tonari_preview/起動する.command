#!/bin/zsh
cd "$(dirname "$0")"
echo "ブラウザで http://127.0.0.1:8080/ を開きます（終了は Ctrl+C）"
(sleep 1; open http://127.0.0.1:8080/) &
python3 -m http.server 8080
