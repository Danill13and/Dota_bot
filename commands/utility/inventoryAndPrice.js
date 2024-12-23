const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const apiKey = process.env.apiKey;;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Показывает инвентарь игрока')
        .addStringOption(option =>
            option
                .setName('steamid')
                .setDescription('Введите ваш Steam ID')
                .setRequired(true)
        ),
    async execute(interaction) {
        await interaction.deferReply();
        await interaction.editReply("⏳ Це займе деякий час...");

        const steamId = interaction.options.getString('steamid');
        const userData = await getInventory(steamId);

        if (!userData) {
            return interaction.editReply('🛑 Помилка. Переконайтеся, що профіль Steam відкритий і спробуйте знову.');
        }

        const { img, nik, totalPrice, inventory, arcaneItems, immortalItems } = userData;

        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('price').setLabel('📊 Ціна').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('arcane').setLabel('🌀 Arcane').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('immortal').setLabel('🌟 Immortal').setStyle(ButtonStyle.Secondary),
            );

        await interaction.editReply({
            content: `Інвентар гравця **${nik || 'Гравець'}**`,
            embeds: [
                new EmbedBuilder()
                    .setColor(0x00FFFF)
                    .setTitle(`Інвентар ${nik || 'Гравця'}`)
                    .setThumbnail(img || 'https://example.com/default-avatar.png')
                    .setDescription(`Загальна вартість інвентарю: **${totalPrice} UAH**`),
            ],
            components: [buttons],
        });

        const collector = interaction.channel.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: 60000,
        });

        collector.on('collect', async i => {
            if (i.customId === 'price') {
                const itemsDescription = Object.values(inventory)
                    .map(item => `**${item.name}**: ${item.price}`)
                    .join('\n') || 'Немає доступних предметів';

                await i.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x00FFFF)
                            .setTitle('📊 Ціна інвентарю')
                            .setDescription(itemsDescription),
                    ],
                });
            } else if (i.customId === 'arcane') {
                await i.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xFF00FF)
                            .setTitle('🌀 Arcane предмети')
                            .setDescription(arcaneItems.length > 0 ? arcaneItems.join('\n') : 'Немає Arcane предметів'),
                    ],
                });
            } else if (i.customId === 'immortal') {
                await i.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xFFD700)
                            .setTitle('🌟 Immortal предмети')
                            .setDescription(immortalItems.length > 0 ? immortalItems.join('\n') : 'Немає Immortal предметів'),
                    ],
                });
            }
        });

        collector.on('end', () => {
            interaction.editReply({ components: [] });
        });
    },
};

async function fetchArcanaMapping() {
    try {
        const url = 'https://api.opendota.com/api/constants/items';
        const response = await axios.get(url);
        const items = response.data;

        // Маппинг аркан и героев
        const arcanaMapping = {
            "Fiery Soul of the Slayer": "Lina",
            "Fractal Horns of Inner Abysm": "Terrorblade",
            "Manifold Paradox": "Phantom Assassin",
            "Demon Eater": "Shadow Fiend",
            "Inscribed Blades of Voth Domosh": "Legion Commander",
            "Frost Avalanche": "Crystal Maiden",
            "Tempest Helm of the Thundergod": "Zeus",
            "Great Sage's Reckoning": "Monkey King",
            "Bladeform Legacy": "Juggernaut",
            "Feast of Abscession": "Pudge",
            "The Magus Cypher": "Rubick",
            "Planetfall": "Earthshaker",
            "Flockheart's Gamble": "Ogre Magi",
            "The One True King": "Wraith King",
            "The Eminence of Ristul": "Queen of Pain",
            "Compass of the Rising Gale": "Windranger",
            "Phantom Advent": "Spectre",
            "Dread Retribution": "Drow Ranger",
            "Claszian Apostasy": "Faceless Void",
            "Voidstorm Asylum": "Razor",
            "Inscribed Swine of the Sunken Galley":"Techies"
        };

        return arcanaMapping;
    } catch (error) {
        console.error("Ошибка при запросе данных об арканах:", error.message);
        return null;
    }
}

// Основная функция для получения инвентаря
async function getInventory(input) {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    try {
        const steamUrlPattern = /https?:\/\/steamcommunity\.com\/profiles\/(\d+)/;
        let steamId = input;
        let img, nik, totalPrice = 0;
        const inventory = {};
        const arcaneItems = [];
        const immortalItems = [];
        let startAssetId = null;

        if (steamUrlPattern.test(input)) {
            steamId = input.match(steamUrlPattern)[1];
        }

        const steamResponse = await axios.get(
            `http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`
        );
        const steamData = steamResponse.data;

        if (steamData?.response?.players?.length > 0) {
            const player = steamData.response.players[0];
            img = player.avatarfull;
            nik = player.personaname;
        }

        const currencyResponse = await axios.get(
            'https://api.privatbank.ua/p24api/pubinfo?exchange&coursid=11'
        );
        const exchangeRate = parseFloat(currencyResponse.data[1].buy);
        
        let hasMoreItems = true;

        const arcanaMapping = await fetchArcanaMapping();

        while (hasMoreItems) {
            const inventoryUrl = `https://steamcommunity.com/inventory/${steamId}/570/2?l=english` +
                (startAssetId ? `&start_assetid=${startAssetId}` : '');
            const inventoryResponse = await axios.get(inventoryUrl);
            const inventoryData = inventoryResponse.data;

            if (inventoryData?.assets) {
                inventoryData.descriptions.forEach(item => {
                    if (item.type.includes('Arcana')) {
                        const hero = arcanaMapping[item.market_hash_name] || "Невідомий герой ";
                        arcaneItems.push(`${item.market_hash_name} (${hero})`);
                    }
                    if (item.type.includes('Immortal')) {
                        immortalItems.push(item.market_hash_name);
                    }
                });

                const filteredItems = inventoryData.descriptions.filter(item => item.tradable === 1 && item.marketable === 1);

                for (let i = 0; i < filteredItems.length; i++) {
                    const item = filteredItems[i];
                    const priceUrl = `https://steamcommunity.com/market/priceoverview/?appid=570&currency=1&market_hash_name=${encodeURIComponent(item.market_hash_name)}`;

                    await delay(7000);
                    try {
                        const priceResponse = await axios.get(priceUrl);
                        const priceData = priceResponse.data;

                        if (priceData?.lowest_price) {
                            const priceInUsd = parseFloat(priceData.lowest_price.replace('$', ''));
                            const priceInUah = (priceInUsd * exchangeRate).toFixed(2);
                            totalPrice += Number(priceInUah);

                            inventory[`item${i}`] = {
                                name: item.market_hash_name,
                                price: `${priceInUah} UAH`,
                            };
                        }
                    } catch (error) {
                        console.error(`Ошибка получения цены для ${item.market_hash_name}: ${error.message}`);
                    }
                }

                hasMoreItems = !!inventoryData.more_items;
                startAssetId = inventoryData.last_assetid || null;
            } else {
                hasMoreItems = false;
            }
        }

        return { img, nik, inventory, totalPrice, arcaneItems, immortalItems };
    } catch (error) {
        console.error('Ошибка при запросе инвентаря:', error.message);
        return null;
    }
}

// Пример вызова функции
(async () => {
    const result = await getInventory("https://steamcommunity.com/profiles/76561198000000000");
    console.log(result);
})();
