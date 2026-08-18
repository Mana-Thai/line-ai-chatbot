@echo off
rem Windows用の起動スクリプト。初回は自動で仮想環境を作って依存を入れる。
rem   run.bat                          対話モード
rem   run.bat --task "デスクトップを整理して"
rem   run.bat --root D:\work --gui
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo [setup] 仮想環境を作成中...
    python -m venv .venv || goto :error
    call .venv\Scripts\activate.bat
    python -m pip install --quiet --upgrade pip
    python -m pip install --quiet -r requirements.txt || goto :error
) else (
    call .venv\Scripts\activate.bat
)

if "%ANTHROPIC_API_KEY%"=="" (
    echo [error] 環境変数 ANTHROPIC_API_KEY が未設定です。
    echo         setx ANTHROPIC_API_KEY "sk-ant-..."  を実行してから窓を開き直してください。
    exit /b 1
)

python agent.py %*
goto :eof

:error
echo [error] セットアップに失敗しました。Python 3.10 以上が入っているか確認してください。
exit /b 1
