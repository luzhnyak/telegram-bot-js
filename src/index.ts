import dotenv from "dotenv";
import { Bot, InlineKeyboard, Context, GrammyError, HttpError } from "grammy";
import { hydrate, HydrateFlavor } from "@grammyjs/hydrate";

dotenv.config();

type Choice = "gameStone" | "gameScissors" | "gamePaper";

type MyContext = HydrateFlavor<Context>;

const bot = new Bot<MyContext>(process.env.TG_API_KEY || "");
bot.use(hydrate());

bot.api.setMyCommands([
  { command: "start", description: "Start bot" },
  {
    command: "game_ssp",
    description: "Play the game 'Scissors, stone, paper'",
  },
]);

bot.command("start", async (ctx) => {
  const inlineKeyboard = new InlineKeyboard()
    .text("🪨✂️🧻 Game 'Камінь, ножиці, папір'", "game_ssp")
    .row()
    .text("Game", "game");

  await ctx.reply("Привіт! Вибери опцію для продовження!", {
    reply_markup: inlineKeyboard,
  });
});

const inlineKeyboardSSP = new InlineKeyboard()
  .text("Камінь 🪨", "gameStone")
  .text("Ножиці ✂️", "gameScissors")
  .text("Папір 🧻", "gamePaper");

bot.callbackQuery("game_ssp", async (ctx) => {
  await ctx.reply(
    `Граємо у 'камінь, ножиці, папір'\\. Обери один із варіантів: камінь, ножиці або папір\\.`,
    {
      reply_markup: inlineKeyboardSSP,
      parse_mode: "MarkdownV2",
    }
  );
  ctx.answerCallbackQuery();
});

bot.callbackQuery(/game[Stone,Scissors,Paper]/, async (ctx) => {
  const userChoice: Choice = ctx.callbackQuery.data as Choice;
  const options = {
    gameStone: "🪨 камінь",
    gameScissors: "✂️ ножиці",
    gamePaper: "🧻 папір",
  };

  // Випадковий вибір бота
  const botChoice: Choice = Object.keys(options)[
    Math.floor(Math.random() * Object.keys(options).length)
  ] as Choice;

  // Визначаємо результат
  let result: string;
  if (userChoice === botChoice) {
    result = "*Нічия\\!*";
  } else if (
    (userChoice === "gameStone" && botChoice === "gameScissors") ||
    (userChoice === "gameScissors" && botChoice === "gamePaper") ||
    (userChoice === "gamePaper" && botChoice === "gameStone")
  ) {
    result = "*Ти переміг\\!*";
  } else {
    result = "*Бот переміг\\!*";
  }

  try {
    await ctx.callbackQuery.message?.editText(
      `Граємо у 'камінь, ножиці, папір'\\. Обери один із варіантів: камінь, ножиці або папір\\.\n` +
        `————— Результат —————\n` +
        `Твій вибір: ${options[userChoice]}\n` +
        `Вибір бота: ${options[botChoice]}\n` +
        `${result}`,
      {
        reply_markup: inlineKeyboardSSP,
        parse_mode: "MarkdownV2",
      }
    );
  } catch (error) {
    if (
      error instanceof GrammyError &&
      error.description ===
        "Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message"
    ) {
      // Ігноруємо помилку, коли повідомлення не було змінено
      console.error("Повідомлення не змінилось, помилка ігнорується.");
    } else {
      throw error; // Якщо це інша помилка, вона буде оброблена у bot.catch
    }
  }

  ctx.answerCallbackQuery();
});

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

bot.start();
