import asyncio
import tempfile
import unittest
from types import SimpleNamespace
from spy_bridge import VoiceController

class Member:
    def __init__(self, id, channel, muted=False):
        self.id, self.bot = id, False
        self.voice = SimpleNamespace(channel=channel, mute=muted)
        self.calls = []
        self.fail = False
    async def edit(self, *, mute, reason):
        if self.fail:
            raise RuntimeError('Discord unavailable')
        self.calls.append(mute)
        self.voice.mute = mute

class VoiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.guild = SimpleNamespace(id=100)
        self.channel = SimpleNamespace(id=200, guild=self.guild)
        self.members = [Member(1, self.channel), Member(2, self.channel), Member(3, self.channel, True)]
        self.channel.members = self.members
        self.guild.get_member = lambda id: next((m for m in self.members if m.id==id), None)
        bot = SimpleNamespace(get_guild=lambda id: self.guild)
        self.c = VoiceController(bot, self.folder.name+'/state.json')
    def tearDown(self):
        self.folder.cleanup()
    async def test_turn_and_all_preserve_existing_mute(self):
        await self.c.apply(self.channel, {'mode':'turn','allowed':['1']})
        self.assertFalse(self.members[0].voice.mute)
        self.assertTrue(self.members[1].voice.mute)
        self.assertEqual(self.members[2].calls, [])
        await self.c.apply(self.channel, {'mode':'all','allowed':[]})
        self.assertFalse(self.members[1].voice.mute)
        self.assertTrue(self.members[2].voice.mute)
        self.assertEqual(self.c.data['muted'], {})
    async def test_turn_change_mutes_previous_and_unmutes_next(self):
        await self.c.apply(self.channel, {'mode':'turn','allowed':['1']})
        await self.c.apply(self.channel, {'mode':'turn','allowed':['2']})
        self.assertTrue(self.members[0].voice.mute)
        self.assertFalse(self.members[1].voice.mute)
    async def test_journal_survives_restart_and_retries_failed_restore(self):
        await self.c.apply(self.channel, {'mode':'turn','allowed':[]})
        restored = VoiceController(self.c.bot, self.c.path)
        self.members[0].fail = True
        await restored.restore()
        self.assertIn('100:1', restored.data['muted'])
        self.members[0].fail = False
        await restored.restore()
        self.assertEqual(restored.data['muted'], {})
    async def test_departed_member_is_restored_in_other_channel(self):
        await self.c.apply(self.channel, {'mode':'turn','allowed':[]})
        self.members[0].voice.channel = SimpleNamespace(id=201)
        await self.c.restore_departed(self.channel)
        self.assertFalse(self.members[0].voice.mute)
    async def test_offline_member_remains_journaled_until_rejoin(self):
        await self.c.apply(self.channel, {'mode':'turn','allowed':[]})
        self.members[0].voice.channel = None
        await self.c.restore()
        self.assertIn('100:1', self.c.data['muted'])
        self.members[0].voice.channel = self.channel
        await self.c.restore()
        self.assertEqual(self.c.data['muted'], {})

if __name__=='__main__':
    unittest.main()
