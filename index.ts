import { ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Client, ComponentType, Interaction, InteractionReplyOptions, MessageCreateOptions, ModalSubmitInteraction, Snowflake, TextInputStyle } from "discord.js";

const TEXTFIELD_CUSTOM_ID = "textfield";
const MODAL_CUSTOM_ID = "modal";
const BUTTON_CUSTOM_ID = "button";
const client = new Client({
  intents: ["Guilds"]
});
const lock = new Set<string>();

function createPostButton(): MessageCreateOptions & InteractionReplyOptions {
  return {
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            customId: BUTTON_CUSTOM_ID,
            style: ButtonStyle.Primary,
            label: "post"
          }
        ]
      }
    ]
  };
}


async function withLock<T>(channelId: Snowflake, transaction: () => Promise<T>): Promise<T | null> {
  const locked = lock.has(channelId);
  if (locked) {
    return null;
  }
  lock.add(channelId);
  try {
    const result = transaction();
    return result;
  } finally {
    lock.delete(channelId);
  }
}

async function handleModalSubmit(intr: ModalSubmitInteraction) {
  const channel = intr.channel;
  if (!channel || !intr.inGuild()) {
    throw Error("unreachable");
  }
  const value = intr.fields.getTextInputValue(TEXTFIELD_CUSTOM_ID);
  await intr.reply(value);
  const message = intr.message;
  if (message == null) {
    return;
  }
  await withLock(channel.id, async () => {
    await channel.messages.delete(message.id);
    await channel.send(createPostButton())
  });
}
async function handleButton(intr: ButtonInteraction) {
  await intr.showModal({
    customId: MODAL_CUSTOM_ID,
    title: "title",
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            customId: TEXTFIELD_CUSTOM_ID,
            required: true,
            style: TextInputStyle.Paragraph,
            label: "text"
          }
        ]
      }
    ]
  });
}

async function handleChatInputCommand(intr: ChatInputCommandInteraction) {
  switch (intr.commandName) {
    case "place":
      await intr.deferReply({
        ephemeral: true,
      });
      await intr.channel!.send(createPostButton());
      await intr.followUp({
        ephemeral: true,
        content: "ボタンを設置しました。"
      })
      return;
  }
}

async function handleInteraction(intr: Interaction) {
  if (intr.isChatInputCommand()) {
    await handleChatInputCommand(intr);
  } else if (intr.isModalSubmit()) {
    await handleModalSubmit(intr);
  } else if (intr.isButton()) {
    await handleButton(intr);
  }
}


client.on("interactionCreate", (intr) => {
  handleInteraction(intr).catch(err => {
    console.error(err);
  });
});
client.once("ready", () => {
  client.application?.commands.set([{
    name: "place",
    description: "ボタン設置"
  }]).then(console.log)
});

client.login(process.env.DISCORD_TOKEN!)