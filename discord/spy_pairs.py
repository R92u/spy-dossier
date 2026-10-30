"""Temporary pair rooms with a durable return journal and server acknowledgements."""
import asyncio
import time


class PairRooms:
    def __init__(self, controller):
        self.c = controller
        self.c.data.setdefault('pairs', {})
        self.reports = {}
        self.channels = {}

    def channel(self, channel_id):
        return self.c.bot.get_channel(int(channel_id)) or self.channels.get(str(channel_id))

    async def move(self, member, destination, reason):
        await asyncio.wait_for(member.move_to(destination, reason=reason), 6)
        for _ in range(30):
            current = member.voice.channel if member.voice else None
            if current and current.id == destination.id:
                return
            await asyncio.sleep(.1)
        raise ValueError('Discord не подтвердил перенос участника')

    async def return_all(self, channel_id):
        record = self.c.data['pairs'].get(str(channel_id))
        if not record:
            return True
        guild = self.c.bot.get_guild(int(record['guild']))
        if not guild:
            return False
        complete = True
        for user_id, origin in list(record['members'].items()):
            member = guild.get_member(int(user_id))
            current = member.voice.channel if member and member.voice else None
            if current and str(current.id) in record['channels']:
                destination = self.channel(origin)
                if not destination:
                    complete = False
                    continue
                try:
                    await self.move(member, destination, 'Шпион: возвращение за стол')
                except Exception:
                    complete = False
                    continue
            # Never drag someone back from a channel they voluntarily moved to.
            record['members'].pop(user_id, None)
            self.c.save()
        await self.c.restore(channel_id)
        for temporary_id in list(record['channels']):
            temporary = self.channel(temporary_id)
            if temporary:
                if temporary.members:
                    complete = False
                    continue
                try:
                    await asyncio.wait_for(temporary.delete(reason='Шпион: завершение парного разговора'), 6)
                except Exception:
                    complete = False
                    continue
            self.channels.pop(temporary_id, None)
            record['channels'].remove(temporary_id)
            self.c.save()
        if complete:
            self.c.data['pairs'].pop(str(channel_id), None)
            self.c.save()
        return complete

    async def prepare(self, channel, event, heartbeat):
        import discord
        permissions = channel.permissions_for(channel.guild.me)
        if not (permissions.manage_channels and permissions.move_members and permissions.mute_members):
            raise ValueError('Для парных комнат нужны Manage Channels, Move Members и Mute Members')
        groups = event.get('groups', [])
        if not groups or len(groups) > 6 or any(len(g) > 3 for g in groups):
            raise ValueError('Некорректные группы парных комнат')
        ids = [str(user) for group in groups for user in group]
        if len(ids) != len(set(ids)) or len(ids) > 12:
            raise ValueError('Некорректные участники парных комнат')
        members = {str(m.id): m for m in channel.members if not m.bot}
        if any(user not in members for user in ids):
            raise ValueError('Один из участников покинул игровой войс')
        key = str(channel.id)
        record = {'id': event['id'], 'guild': str(channel.guild.id), 'channels': [], 'members': {}, 'ready': False}
        self.c.data['pairs'][key] = record
        self.c.save()
        steps = max(1, len([g for g in groups if g]) + len(ids))
        done = 0
        for index, group in enumerate(groups):
            if not group:  # Virtual seats in the solo test have no Discord members.
                continue
            overwrites = {target: overwrite for target, overwrite in channel.overwrites.items()}
            for overwrite in overwrites.values():
                overwrite.connect = False
            default = overwrites.get(channel.guild.default_role, discord.PermissionOverwrite())
            default.connect = False
            overwrites[channel.guild.default_role] = default
            overwrites[channel.guild.me] = discord.PermissionOverwrite(view_channel=True, connect=True, manage_channels=True, move_members=True, mute_members=True)
            for user in group:
                overwrites[members[user]] = discord.PermissionOverwrite(view_channel=True, connect=True, speak=True)
            temporary = await asyncio.wait_for(channel.guild.create_voice_channel(
                f'Шпион · {index + 1}', category=channel.category, overwrites=overwrites,
                reason='Шпион: парный разговор на 20 секунд'), 8)
            self.channels[str(temporary.id)] = temporary
            record['channels'].append(str(temporary.id))
            self.c.save()
            done += 1
            await heartbeat(done / steps)
            for user in group:
                member = members[user]
                if not member.voice or member.voice.channel != channel:
                    raise ValueError('Участник сменил канал во время подготовки')
                record['members'][user] = str(channel.id)
                self.c.save()  # Journal before moving, including process termination mid-request.
                await self.move(member, temporary, 'Шпион: парный разговор')
                done += 1
                await heartbeat(done / steps)
        await self.c.restore(channel.id)
        if any(r['channel'] == str(channel.id) and r['member'] in ids for r in self.c.data['muted'].values()):
            raise ValueError('Не удалось включить микрофоны участников')
        record['ready'] = True
        record['expires'] = time.time() + 25
        self.c.save()

    async def apply(self, channel, policy, heartbeat):
        key = str(channel.id)
        event = policy.get('pairEvent')
        record = self.c.data['pairs'].get(key)
        if not event:
            if record:
                await self.return_all(key)
            self.reports.pop(key, None)
            return False
        report = {'id': event['id'], 'status': 'preparing', 'progress': 0}
        self.reports[key] = report
        if event['stage'] == 'return':
            if await self.return_all(key):
                report['status'] = 'returned'
            return True
        if record and record['id'] != event['id']:
            if not await self.return_all(key):
                raise ValueError('Не завершён возврат из предыдущих комнат')
            record = None
        if record and not record.get('ready'):
            raise ValueError('Подготовка прервалась; возвращаем участников')
        if not record:
            if event['stage'] != 'prepare':
                raise ValueError('Комнаты утрачены после перезапуска')
            await self.c.apply(channel, {'mode': 'turn', 'allowed': []})

            async def progress(value):
                report['progress'] = min(value, .99)
                response = await heartbeat()
                current = response.get('pairEvent') or {}
                if current.get('id') != event['id'] or current.get('stage') != 'prepare':
                    raise ValueError('Подготовка парных комнат отменена')

            await self.prepare(channel, event, progress)
        report.update(status='ready', progress=1)
        record = self.c.data['pairs'].get(key)
        if record and time.time() >= record.get('expires', 0):
            raise ValueError('Время парного разговора истекло; возвращаем участников')
        return True

    def roster(self, channel):
        ids = {str(m.id) for m in channel.members if not m.bot}
        record = self.c.data['pairs'].get(str(channel.id))
        if record:
            for temporary_id in record['channels']:
                temporary = self.channel(temporary_id)
                if temporary:
                    ids.update(str(m.id) for m in temporary.members if not m.bot)
        return list(ids)
