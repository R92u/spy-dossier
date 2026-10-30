import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from spy_bridge import VoiceController


class Member:
    def __init__(self, user_id, channel, muted=False):
        self.id = user_id
        self.bot = False
        self.voice = SimpleNamespace(channel=channel, mute=muted)
        self.fail_move = False

    async def edit(self, *, mute, reason):
        self.voice.mute = mute

    async def move_to(self, channel, *, reason):
        if self.fail_move:
            raise RuntimeError('Move failed')
        self.voice.channel.members.remove(self)
        self.voice.channel = channel
        channel.members.append(self)


class Channel:
    def __init__(self, channel_id, guild):
        self.id, self.guild = channel_id, guild
        self.members, self.overwrites, self.category = [], {}, None
        self.permissions = SimpleNamespace(manage_channels=True, move_members=True, mute_members=True)

    def permissions_for(self, member):
        return self.permissions

    async def delete(self, *, reason):
        assert not self.members
        self.guild.channels.pop(self.id)


class PairTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.guild = SimpleNamespace(id=100, me=object(), default_role=object(), channels={})
        self.channel = Channel(200, self.guild)
        self.guild.channels[200] = self.channel
        self.members = [Member(1, self.channel), Member(2, self.channel), Member(3, self.channel, True)]
        self.channel.members = list(self.members)
        self.guild.get_member = lambda user_id: next((m for m in self.members if m.id == user_id), None)

        async def create(name, *, category, overwrites, reason):
            channel = Channel(300 + len(self.guild.channels), self.guild)
            self.guild.channels[channel.id] = channel
            return channel
        self.guild.create_voice_channel = AsyncMock(side_effect=create)
        self.bot = SimpleNamespace(get_guild=lambda _: self.guild, get_channel=lambda cid: self.guild.channels.get(cid))
        self.c = VoiceController(self.bot, self.folder.name + '/state.json')
        self.event = {'id': 'event1', 'stage': 'prepare', 'groups': [['1', '2'], ['3']], 'endsAt': None}
        self.heartbeat = AsyncMock(return_value={'pairEvent': self.event})

    def tearDown(self):
        self.folder.cleanup()

    async def prepare(self):
        await self.c.pairs.apply(self.channel, {'pairEvent': self.event}, self.heartbeat)

    async def test_prepare_moves_and_unmutes_then_returns_without_losing_admin_mute(self):
        await self.prepare()
        self.assertNotEqual(self.members[0].voice.channel, self.channel)
        self.assertEqual(self.members[0].voice.channel, self.members[1].voice.channel)
        self.assertFalse(self.members[0].voice.mute)
        self.assertTrue(self.members[2].voice.mute)
        self.assertEqual(set(self.c.pairs.roster(self.channel)), {'1', '2', '3'})
        self.assertEqual(self.c.pairs.reports['200']['status'], 'ready')
        self.event['stage'] = 'return'
        await self.c.pairs.apply(self.channel, {'pairEvent': self.event}, self.heartbeat)
        self.assertTrue(all(m.voice.channel == self.channel for m in self.members))
        self.assertEqual(set(self.guild.channels), {200})
        self.assertEqual(self.c.pairs.reports['200']['status'], 'returned')

    async def test_repeated_prepare_does_not_duplicate_channels(self):
        await self.prepare()
        await self.prepare()
        self.assertEqual(self.guild.create_voice_channel.call_count, 2)

    async def test_partial_move_failure_is_recoverable_from_disk(self):
        self.members[1].fail_move = True
        with self.assertRaises(RuntimeError):
            await self.prepare()
        fresh = VoiceController(self.bot, self.c.path)
        self.assertTrue(await fresh.pairs.return_all('200'))
        self.assertEqual(self.members[0].voice.channel, self.channel)
        self.assertEqual(set(self.guild.channels), {200})
        self.assertEqual(fresh.data['pairs'], {})

    async def test_missing_permission_creates_nothing(self):
        self.channel.permissions.manage_channels = False
        with self.assertRaises(ValueError):
            await self.prepare()
        self.guild.create_voice_channel.assert_not_called()

    async def test_cancelled_server_event_rolls_back_on_next_policy(self):
        await self.prepare()
        await self.c.pairs.apply(self.channel, {'mode': 'release'}, self.heartbeat)
        self.assertEqual(set(self.guild.channels), {200})
        self.assertTrue(all(m.voice.channel == self.channel for m in self.members))

    async def test_voluntary_channel_change_is_not_overridden(self):
        await self.prepare()
        other = Channel(999, self.guild)
        self.guild.channels[999] = other
        await self.members[0].move_to(other, reason='Voluntary')
        await self.c.pairs.return_all('200')
        self.assertEqual(self.members[0].voice.channel, other)
        self.assertEqual(set(self.guild.channels), {200, 999})

    async def test_failed_return_keeps_journal_and_retries(self):
        await self.prepare()
        self.members[0].fail_move = True
        self.assertFalse(await self.c.pairs.return_all('200'))
        self.assertIn('200', self.c.data['pairs'])
        self.members[0].fail_move = False
        self.assertTrue(await self.c.pairs.return_all('200'))
        self.assertEqual(set(self.guild.channels), {200})

    async def test_incomplete_journal_cannot_report_ready_after_restart(self):
        self.members[1].fail_move = True
        with self.assertRaises(RuntimeError):
            await self.prepare()
        fresh = VoiceController(self.bot, self.c.path)
        with self.assertRaises(ValueError):
            await fresh.pairs.apply(self.channel, {'pairEvent': self.event}, self.heartbeat)
        self.assertNotEqual(fresh.pairs.reports['200']['status'], 'ready')

    async def test_cross_uses_existing_factory_and_moves_everyone_to_saved_name(self):
        host = Member(9, self.channel)
        self.members.append(host)
        self.channel.members.append(host)
        self.c.channel_owners = {200: 9}
        self.c.save_active = lambda: None
        self.c.data['bindings']['200'] = {'token': 'test'}
        calls = []
        async def factory(owner, source):
            calls.append((owner, source))
            destination = Channel(888, self.guild)
            destination.name = 'Saved host name'
            self.guild.channels[888] = destination
            self.c.channel_owners[888] = owner.id
            await owner.move_to(destination, reason='app.py')
        self.c.create_temp_channel = factory
        self.event.update(kind='cross', hostUserId='9')
        await self.prepare()
        self.event['stage'] = 'return'
        await self.c.pairs.apply(self.channel, {'pairEvent': self.event}, self.heartbeat)
        self.assertEqual(len(calls), 1)
        self.assertTrue(all(m.voice.channel.id == 888 for m in self.members))
        self.assertEqual(set(self.guild.channels), {888})
        self.assertEqual(self.c.data['bindings']['200']['pendingReport']['channelId'], '888')
        self.assertEqual(self.c.pairs.reports['200']['channelName'], 'Saved host name')

    async def test_common_factory_failure_keeps_existing_rooms_recoverable(self):
        host = Member(9, self.channel)
        self.members.append(host)
        self.channel.members.append(host)
        self.c.channel_owners = {200: 9}
        self.c.create_temp_channel = AsyncMock(return_value=None)
        self.event.update(kind='cross', hostUserId='9')
        await self.prepare()
        self.event['stage'] = 'return'
        with self.assertRaises(ValueError):
            await self.c.pairs.apply(self.channel, {'pairEvent': self.event}, self.heartbeat)
        await self.c.pairs.return_all('200')
        self.assertTrue(all(m.voice.channel.id == 200 for m in self.members))
        self.assertEqual(set(self.guild.channels), {200})
