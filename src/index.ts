import dotenv from "dotenv";
import express from "express";
import bodyParser from "body-parser";

import {
  Bot,
  InlineKeyboard,
  Context,
  GrammyError,
  HttpError,
  webhookCallback,
} from "grammy";
import { hydrate, HydrateFlavor } from "@grammyjs/hydrate";

dotenv.config();

type Choice = "gameStone" | "gameScissors" | "gamePaper";

type MyContext = HydrateFlavor<Context>;

const bot = new Bot<MyContext>(process.env.TG_API_KEY || "");

bot.use(hydrate());

bot.api.setMyCommands([{ command: "start", description: "Start bot" }]);

bot.command("start", async (ctx) => {
  const inlineKeyboard = new InlineKeyboard()
    .text("🪨✂️🧻 Гра 'Камінь, ножиці, папір'", "game_ssp")
    .row()
    .text('♣️♥️ Пасьянс "Піраміда" ♠️♦️', "game_piramida")
    .row()
    .webApp(`💣 Гра "Сапер" 💣`, "https://luzhnyak.github.io/minesweeper/");

  await ctx.reply("Привіт! Вибери опцію для продовження!", {
    reply_markup: inlineKeyboard,
  });
});

// =========================== Piramida game =

bot.callbackQuery("game_piramida", async (ctx) => {
  const chatId = ctx.from?.id;
  if (chatId) {
    await ctx.api.sendGame(chatId, "game_piramida");
  }
  ctx.answerCallbackQuery();
});

bot.on("callback_query:game_short_name", async (ctx) => {
  await ctx.answerCallbackQuery({
    url: "https://luzhnyak.github.io/pasyans-pyramida/",
  });
});

// =========================== Stone-Scissors-Paper game =

const inlineKeyboardSSP = new InlineKeyboard()
  .text("Камінь 🪨", "gameStone")
  .text("Ножиці ✂️", "gameScissors")
  .text("Папір 🧻", "gamePaper");

const descSSP = `Граємо у 'камінь, ножиці, папір'\\. Обери один із варіантів: камінь, ножиці або папір\\.`;

bot.callbackQuery("game_ssp", async (ctx) => {
  await ctx.reply(descSSP, {
    reply_markup: inlineKeyboardSSP,
    parse_mode: "MarkdownV2",
  });
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
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (ctx.update.callback_query.message?.message_id && userId && chatId) {
      const messageId = ctx.update.callback_query.message?.message_id;
      const points = Math.floor(Math.random() * 100) + 1;

      try {
        await ctx.api.setGameScore(chatId, messageId, userId, points);
        ctx.reply(`Ваш новий результат: ${points} балів!`);
      } catch (error) {
        console.error("Помилка оновлення балів:", error);
      }
    } else {
      ctx.reply("Помилка: повідомлення не знайдено.");
    }
  } else {
    result = "*Бот переміг\\!*";
  }

  try {
    await ctx.callbackQuery.message?.editText(
      `${descSSP}\n\n` +
        `*Результат*\n` +
        `\n`.padStart(25, "═") +
        `Твій вибір: ${options[userChoice]}\n` +
        `Вибір бота: ${options[botChoice]}\n` +
        `\n`.padStart(25, "═") +
        `${result}\n` +
        `\n`.padStart(25, "═"),
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

// Обробка вебхуків
bot.on("message", async (ctx) => {
  // Перевірте, чи це повідомлення про результати гри
  if (ctx.message?.text?.startsWith("score:")) {
    const parts = ctx.message.text.split(":");
    if (parts.length === 3) {
      const userId = parseInt(parts[1], 10);
      const score = parseInt(parts[2], 10);
      //   const db = await getDb();
      //   await db.run(
      //     "INSERT INTO scores (user_id, score) VALUES (?, ?)",
      //     userId,
      //     score
      //   );
      await ctx.reply(`Ваш бал ${score} збережено!`);
    } else {
      await ctx.reply("Невірний формат повідомлення.");
    }
  }
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

// bot.start();

const app = express();
app.use(bodyParser.json());
app.use(webhookCallback(bot, "express"));

app.get("/", (req, res) => {
  res.sendStatus(200);
});

app.post("/webhook", (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

// Вказати URL для вебхуків
const setWebhook = async () => {
  const webhookUrl = `${process.env.BASE_URL}/webhook`;
  await bot.api.setWebhook(webhookUrl);
};

setWebhook();

// Запустіть сервер
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущено на порту ${PORT}`);
});
