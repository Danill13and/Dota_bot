const { Client, Events, GatewayIntentBits, Collection } = require("discord.js");
const token = process.env.token;
const fs = require('fs');
const path = require('node:path'); 

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
client.cooldowns = new Collection();  // Добавляем коллекцию cooldowns

const foldersPath = path.join(__dirname, "commands");
const commandFolder = fs.readdirSync(foldersPath);

for (const folder of commandFolder) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.log(`[Внимание] Команда в ${filePath} отсутствует требуемый "data" или "execute" значение.`);
    }
  }
}

client.once(Events.ClientReady, readyClient => {
  console.log(`Бот запущен! Привет ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.error(`Команда ${interaction.commandName} не найдена.`);
    return;
  }

  const { cooldowns } = client;
  const now = Date.now();
  const timestamps = cooldowns.get(command.data.name) || new Collection();
  const defaultCooldownDuration = 3;
  const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1000;

  if (!cooldowns.has(command.data.name)) {
    cooldowns.set(command.data.name, timestamps);
  }

  if (timestamps.has(interaction.user.id)) {
    const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

    if (now < expirationTime) {
      const expiredTimestamp = Math.round(expirationTime / 1000);
      return interaction.reply({ content: `Пожалуйста, подождите. Вы сможете использовать команду \`${command.data.name}\` снова <t:${expiredTimestamp}:R>.`, ephemeral: true });
    }
  }

  timestamps.set(interaction.user.id, now);
  setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'При выполнении этой команды произошла ошибка!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'При выполнении этой команды произошла ошибка!', ephemeral: true });
    }
  }
});

client.login(token);