"""Aurorix entry point: preserve the existing app.py and all its commands/settings."""
import os
import runpy
from discord.ext import commands
from spy_bridge import install_spy

original_run = commands.Bot.run

def run_with_spy(bot, *args, **kwargs):
    commands.Bot.run = original_run
    # Install just before the original bot starts, while app.py is still __main__.
    namespace = getattr(bot.on_voice_state_update, '__globals__', {})
    install_spy(bot, namespace.get('temp_channels'))
    return original_run(bot, *args, **kwargs)

commands.Bot.run = run_with_spy
runpy.run_path(os.path.join(os.path.dirname(__file__), 'app.py'), run_name='__main__')
