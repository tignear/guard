import { ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Client, ComponentType, DiscordAPIError, RESTJSONErrorCodes, Interaction, InteractionReplyOptions, MessageCreateOptions, ModalSubmitInteraction, Snowflake, TextInputStyle } from "discord.js";
import { RWLock } from "./lock";

const TEXTFIELD_CUSTOM_ID = "textfield";
const MODAL_CUSTOM_ID = "modal";
const BUTTON_CUSTOM_ID = "button";
const client = new Client({
  intents: ["Guilds"]
});
const lock = new RWLock();

function getPostButton(): MessageCreateOptions & InteractionReplyOptions {
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

async function handleModalSubmit(intr: ModalSubmitInteraction) {
  const channel = intr.channel;
  if (!channel || !intr.inGuild()) {
    throw Error("unreachable");
  }
  const value = intr.fields.getTextInputValue(TEXTFIELD_CUSTOM_ID);
  const message = intr.message;
  if (message == null) {
    return;
  }
  await lock.waitReadLock(channel.id, async () => {
    await intr.reply(value);
  });

  await lock.tryWriteLock(channel.id, async () => {
    const messageId = message.id;
    await message.channel.send({ ...getPostButton(), nonce: messageId });
    await message.delete();
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
            style: TextInputStyle.Short,
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
      await intr.channel!.send(getPostButton());
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
  }])
});

client.login(process.env.DISCORD_TOKEN!)