"""Aurorix entry point: preserve the existing app.py and all its commands/settings."""
import os
import runpy
from spy_bridge import install_spy

app = runpy.run_path(os.path.join(os.path.dirname(__file__), 'app.py'), run_name='spy_original')
bot = app['bot']
install_spy(bot, app.get('temp_channels'))
token = os.getenv('BOT_TOKEN') or app.get('TOKEN')
if not token:
    raise RuntimeError('Укажите BOT_TOKEN в окружении Aurorix')
bot.run(token)
