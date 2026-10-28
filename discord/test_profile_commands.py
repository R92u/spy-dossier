import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import discord
from discord.ext import commands
from spy_bridge import install_spy


class ProfileCommandTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.bot = commands.Bot(command_prefix='~', intents=discord.Intents.default())
        @self.bot.command(name='voice')
        async def voice(ctx):
            return None
        self.old_command = self.bot.get_command('voice')
        self.controller = install_spy(self.bot)
        self.controller.http = AsyncMock()
        self.controller.post = AsyncMock(return_value={'ok': True})
        self.user = SimpleNamespace(id=100000000000000001)
        self.ctx = SimpleNamespace(guild=None, author=self.user,
                                   message=SimpleNamespace(delete=AsyncMock()), send=AsyncMock())

    async def asyncTearDown(self):
        await self.bot.close()

    async def test_profile_command_needs_no_voice_and_uses_authenticated_endpoint(self):
        with patch.dict(os.environ, {'SPY_PROFILE_SECRET': 'test-key-only-' * 4}):
            await self.bot.get_command('spy_link').callback(self.ctx, 'personal-code')
        args, kwargs = self.controller.post.call_args
        self.assertEqual(args[0], 'confirm')
        self.assertEqual(args[1]['userId'], str(self.user.id))
        self.assertEqual(args[1]['code'], 'personal-code')
        self.assertEqual(kwargs['area'], 'profile')
        self.assertIn('сохранён', self.ctx.send.call_args.args[0])
        self.assertIs(self.bot.get_command('voice'), self.old_command)

    async def test_missing_code_does_not_call_server(self):
        await self.bot.get_command('spy_link').callback(self.ctx)
        self.controller.post.assert_not_called()
        self.assertIn('~spy_link', self.ctx.send.call_args.args[0])

    async def test_bad_code_reports_error_without_success(self):
        self.controller.post.side_effect = ValueError('Код профиля неверен или истёк')
        with patch.dict(os.environ, {'SPY_PROFILE_SECRET': 'test-key-only-' * 4}):
            await self.bot.get_command('spy_link').callback(self.ctx, 'expired')
        self.assertIn('истёк', self.ctx.send.call_args.args[0])


if __name__ == '__main__':
    unittest.main()

