@echo off
chcp 65001 >nul
set PYTHONUTF8=1
cd /d "%~dp0"
set PY=python
where py >nul 2>nul && set PY=py -3
%PY% --version >nul 2>nul || (
  echo Python が見つかりません。https://www.python.org/downloads/ からインストールしてください。
  echo インストール時に「Add python.exe to PATH」にチェックを入れてください。
  pause
  exit /b 1
)
echo 必要な部品を確認しています...
%PY% -m pip install -q --disable-pip-version-check -r requirements.txt
%PY% server.py %*
pause
