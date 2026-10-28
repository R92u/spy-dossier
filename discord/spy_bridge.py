"""Room-scoped Discord voice control. No Discord credentials are sent to the game."""
from __future__ import annotations
import asyncio
import json
import os
from pathlib import Path

SITE = os.getenv('SPY_GAME_URL', 'https://spy-dossier.onrender.com').rstrip('/')


class VoiceController:
    def __init__(self, bot, path='.spy-voice-state.json'):
        self.bot = bot
        self.path = Path(path)
        try:
            self.data = json.loads(self.path.read_text('utf-8'))
        except (OSError, ValueError):
            self.data = {'bindings': {}, 'muted': {}}
        self.tasks = {}
        self.http = None
        self.closing = False

    def save(self):
        temporary = self.path.with_suffix('.tmp')
        temporary.write_text(json.dumps(self.data), encoding='utf-8')
        try:
            temporary.chmod(0o600)
        except OSError:
            pass
        temporary.replace(self.path)

    async def post(self, route, data, token=None):
        headers = {'Authorization': 'Bearer ' + token} if token else {}
        async with self.http.post(SITE + '/api/voice/' + route, json=data, headers=headers) as response:
            result = await response.json()
            if response.status != 200:
                raise ValueError(result.get('error', 'Сервер игры недоступен'))
            return result

    async def restore(self, channel_id=None):
        # Records are written BEFORE muting and removed only AFTER a successful restore.
        # Disconnected members stay in the journal until Discord can restore them.
        for key, record in list(self.data['muted'].items()):
            if channel_id is not None and record['channel'] != str(channel_id):
                continue
            guild = self.bot.get_guild(int(record['guild']))
            member = guild.get_member(int(record['member'])) if guild else None
            if member is None or member.voice is None or member.voice.channel is None:
                continue
            try:
                await asyncio.wait_for(member.edit(mute=False, reason='Шпион: восстановление микрофона'), 3)
            except Exception:
                continue
            self.data['muted'].pop(key, None)
            self.save()

    async def apply(self, channel, policy):
        if policy['mode'] in ('release', 'all'):
            await self.restore(channel.id)
            return
        allowed = set(policy['allowed'])
        for member in list(channel.members):
            if member.bot or not member.voice or member.voice.channel != channel:
                continue
            key = f'{channel.guild.id}:{member.id}'
            record = self.data['muted'].get(key)
            if str(member.id) in allowed:
                if record:
                    await asyncio.wait_for(member.edit(mute=False, reason='Шпион: ваш ход / перешёптывание'), 3)
                    self.data['muted'].pop(key, None)
                    self.save()
            elif not member.voice.mute:
                self.data['muted'][key] = {'guild': str(channel.guild.id), 'member': str(member.id), 'channel': str(channel.id)}
                self.save()
                await asyncio.wait_for(member.edit(mute=True, reason='Шпион: ход другого игрока'), 3)

    async def restore_departed(self, channel):
        # Moving to another channel must not carry a game-imposed server mute.
        for key, record in list(self.data['muted'].items()):
            if record['channel'] != str(channel.id):
                continue
            member = channel.guild.get_member(int(record['member']))
            if member and member.voice and member.voice.channel and member.voice.channel != channel:
                try:
                    await asyncio.wait_for(member.edit(mute=False, reason='Шпион: выход из игрового канала'), 3)
                except Exception:
                    continue
                self.data['muted'].pop(key, None)
                self.save()

    async def worker(self, channel_id):
        error = None
        try:
            while not self.closing and channel_id in self.data['bindings']:
                binding = self.data['bindings'][channel_id]
                channel = self.bot.get_channel(int(channel_id))
                try:
                    if not channel or not self.bot.is_ready():
                        raise ValueError('Discord не подключён или канал удалён')
                    if not channel.permissions_for(channel.guild.me).mute_members:
                        raise ValueError('Боту нужно право Mute Members в голосовом канале')
                    await self.restore_departed(channel)
                    policy = await self.post('poll', {'roster': [str(m.id) for m in channel.members if not m.bot], 'error': error}, binding['token'])
                    if policy.get('closed'):
                        break
                    await asyncio.wait_for(self.apply(channel, policy), 4)
                    error = None
                except ValueError as exc:
                    error = str(exc)
                    await self.restore(channel_id)
                    if 'Привязка бота завершена' in error:
                        break
                except Exception:
                    error = 'Ошибка Discord или сервера игры; микрофоны восстанавливаются'
                    await self.restore(channel_id)
                await asyncio.sleep(.8)
        finally:
            await self.restore(channel_id)
            self.data['bindings'].pop(channel_id, None)
            self.save()

    async def recover_unbound(self):
        while not self.closing:
            for channel in {r['channel'] for r in self.data['muted'].values()} - self.data['bindings'].keys():
                await self.restore(channel)
            await asyncio.sleep(2)

    def launch(self, channel_id):
        task = self.tasks.get(channel_id)
        if not task or task.done():
            self.tasks[channel_id] = asyncio.create_task(self.worker(channel_id))

    async def stop(self, channel_id):
        task = self.tasks.pop(channel_id, None)
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        await self.restore(channel_id)
        self.data['bindings'].pop(channel_id, None)
        self.save()


def install_spy(bot, channel_owners=None):
    import aiohttp
    import discord
    from discord import app_commands
    # discord.py resolves command annotations from module globals.
    globals()['discord'] = discord
    controller = VoiceController(bot)
    bot.spy_voice = controller
    started = False
    recovery = None

    async def checked_channel(interaction, moderator=False):
        if not interaction.guild or not interaction.user.voice:
            raise ValueError('Сначала зайдите в голосовой канал сервера')
        channel = interaction.user.voice.channel
        if not isinstance(channel, discord.VoiceChannel):
            raise ValueError('Нужен обычный голосовой канал, не трибуна')
        owner = (channel_owners or {}).get(channel.id) == interaction.user.id
        if moderator and not (channel.permissions_for(interaction.user).mute_members or owner):
            raise ValueError('Подключать канал может владелец канала или участник с правом Mute Members')
        if not channel.permissions_for(interaction.guild.me).mute_members:
            raise ValueError('Выдайте боту право Mute Members в этом канале')
        if controller.http is None:
            raise ValueError('Бот запускается, попробуйте через несколько секунд')
        return channel

    @bot.tree.command(name='spy_connect', description='Связать голосовой канал с лобби Шпиона')
    @app_commands.describe(code='Одноразовый код ведущего из настроек лобби')
    async def spy_connect(interaction: discord.Interaction, code: str):
        await interaction.response.defer(ephemeral=True)
        try:
            channel = await checked_channel(interaction, True)
            if str(channel.id) in controller.data['bindings']:
                raise ValueError('Сначала выполните /spy_disconnect')
            result = await controller.post('connect', {'code': code.strip(), 'guildId': str(interaction.guild.id), 'channelId': str(channel.id), 'channelName': channel.name, 'userId': str(interaction.user.id)})
            controller.data['bindings'][str(channel.id)] = {'token': result['token'], 'guild': str(interaction.guild.id), 'room': result['room']}
            controller.save()
            controller.launch(str(channel.id))
            await interaction.followup.send('Канал привязан. Игроки: возьмите личный код в лобби и выполните /spy_join.', ephemeral=True)
        except Exception as exc:
            await interaction.followup.send(str(exc) if isinstance(exc, ValueError) else 'Не удалось подключить канал. Проверьте доступность игры.', ephemeral=True)

    @bot.tree.command(name='spy_join', description='Привязать своё место за столом к Discord')
    @app_commands.describe(code='Личный одноразовый код из лобби')
    async def spy_join(interaction: discord.Interaction, code: str):
        await interaction.response.defer(ephemeral=True)
        try:
            channel = await checked_channel(interaction)
            binding = controller.data['bindings'].get(str(channel.id))
            if not binding:
                raise ValueError('Ведущий ещё не подключил этот канал')
            await controller.post('join', {'code': code.strip(), 'userId': str(interaction.user.id)}, binding['token'])
            await interaction.followup.send('Ваше место за столом связано с Discord.', ephemeral=True)
        except Exception as exc:
            await interaction.followup.send(str(exc) if isinstance(exc, ValueError) else 'Не удалось привязать игрока. Попробуйте ещё раз.', ephemeral=True)

    @bot.tree.command(name='spy_disconnect', description='Отключить игру и вернуть микрофоны')
    async def spy_disconnect(interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            channel = await checked_channel(interaction, True)
            binding = controller.data['bindings'].get(str(channel.id))
            if binding:
                try:
                    await controller.post('disconnect', {}, binding['token'])
                except Exception:
                    pass
            await controller.stop(str(channel.id))
            await interaction.followup.send('Управление отключено. Муты игры сняты; отсутствующие участники восстановятся при подключении.', ephemeral=True)
        except Exception as exc:
            await interaction.followup.send(str(exc) if isinstance(exc, ValueError) else 'Ошибка восстановления; проверьте право Mute Members.', ephemeral=True)

    # Prefix commands work immediately, including installations without a slash menu.
    # Delete the one-use code message when channel permissions allow it.
    def prefix_command(name, command, needs_code):
        async def invoke(ctx, code: str = ''):
            from types import SimpleNamespace
            async def defer(**kwargs):
                return None
            async def send(content, **kwargs):
                await ctx.send(content, delete_after=30, allowed_mentions=discord.AllowedMentions.none())
            try:
                await ctx.message.delete()
            except discord.HTTPException:
                pass
            if needs_code and not code:
                await send('Укажите код: ~' + name + ' КОД_С_САЙТА')
                return
            proxy = SimpleNamespace(guild=ctx.guild, user=ctx.author,
                                    response=SimpleNamespace(defer=defer),
                                    followup=SimpleNamespace(send=send))
            if needs_code:
                await command.callback(proxy, code)
            else:
                await command.callback(proxy)
        bot.command(name=name)(invoke)

    prefix_command('spy_connect', spy_connect, True)
    prefix_command('spy_join', spy_join, True)
    prefix_command('spy_disconnect', spy_disconnect, False)

    async def ready():
        nonlocal started, recovery
        if started:
            return
        started = True
        # Aurorix sends SIGTERM on a normal stop/restart.
        try:
            import signal
            asyncio.get_running_loop().add_signal_handler(signal.SIGTERM, lambda: asyncio.create_task(bot.close()))
        except (NotImplementedError, RuntimeError):
            pass
        controller.http = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=4))
        await controller.restore()
        recovery = asyncio.create_task(controller.recover_unbound())
        for channel_id in list(controller.data['bindings']):
            controller.launch(channel_id)
        try:
            await bot.tree.sync()
            for guild in bot.guilds:
                target = discord.Object(id=guild.id)
                bot.tree.copy_global_to(guild=target)
                await bot.tree.sync(guild=target)
            print('[spy] Готово: ~spy_connect, ~spy_join, ~spy_disconnect; slash-команды также зарегистрированы')
        except Exception:
            print('[spy] Не удалось зарегистрировать команды; проверьте область applications.commands')

    bot.add_listener(ready, 'on_ready')
    original_close = bot.close

    async def close():
        controller.closing = True
        for channel_id in list(controller.tasks):
            binding = controller.data['bindings'].get(channel_id)
            if binding and controller.http:
                try:
                    await controller.post('disconnect', {}, binding['token'])
                except Exception:
                    pass
            await controller.stop(channel_id)
        if recovery:
            recovery.cancel()
        await controller.restore()
        if controller.http:
            await controller.http.close()
        await original_close()

    bot.close = close
    return controller
