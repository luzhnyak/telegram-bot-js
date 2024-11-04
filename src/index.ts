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
    .text("❌ Гра 'Хрестики-нолики' ⭕", "game_tictactoe")
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

// =========================== Tic-Tac-Toe game =

type Player = "X" | "O";

type GameState = {
  board: (Player | null)[][];
  currentPlayer: Player;
  chatId: number;
  messageId: number;
  isGameOver: boolean;
};

// Зберігаємо стани ігор за ключем chatId-messageId
let gameStates: Record<string, GameState> = {};

// Функція для старту нової гри
const startNewGame = async (ctx: any) => {
  const message = await ctx.reply(
    'Гра "Хрестики-Нулики" розпочата! Ви граєте за X, бот грає за O. Ваш хід.',
    {
      reply_markup: renderBoard(
        Array(3)
          .fill(null)
          .map(() => Array(3).fill(null))
      ),
    }
  );

  // Ідентифікатор гри — комбінація chatId та messageId
  const gameKey = `${ctx.chat.id}-${message.message_id}`;
  gameStates[gameKey] = {
    board: Array(3)
      .fill(null)
      .map(() => Array(3).fill(null)),
    currentPlayer: "X",
    chatId: ctx.chat.id,
    messageId: message.message_id,
    isGameOver: false,
  };
  //   return gameKey;
};

// Перевірка на перемогу
const checkWinner = (board: (Player | null)[][]): Player | null => {
  const winningConditions = [
    // Горизонтальні
    [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
    ],
    [
      [2, 0],
      [2, 1],
      [2, 2],
    ],
    // Вертикальні
    [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [0, 2],
      [1, 2],
      [2, 2],
    ],
    // Діагоналі
    [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
    [
      [0, 2],
      [1, 1],
      [2, 0],
    ],
  ];
  for (const condition of winningConditions) {
    const [a, b, c] = condition;
    if (
      board[a[0]][a[1]] &&
      board[a[0]][a[1]] === board[b[0]][b[1]] &&
      board[a[0]][a[1]] === board[c[0]][c[1]]
    ) {
      return board[a[0]][a[1]];
    }
  }
  return null;
};

// Створення InlineKeyboard на основі поточного стану
const renderBoard = (
  board: (Player | null)[][],
  isGameOver: boolean = false
): InlineKeyboard => {
  const keyboard = new InlineKeyboard();
  board.forEach((row, i) => {
    row.forEach((cell, j) => {
      keyboard.text(cell || " ", `${i},${j}`);
    });
    keyboard.row();
  });

  if (isGameOver) {
    keyboard.row().text("Нова гра", "game_tictactoe_new");
  }
  return keyboard;
};

// Хід бота (випадковий вибір)
const botMove = (gameState: GameState) => {
  const availableMoves: [number, number][] = [];
  gameState.board.forEach((row, i) => {
    row.forEach((cell, j) => {
      if (!cell) availableMoves.push([i, j]);
    });
  });

  if (availableMoves.length === 0) return;

  const [i, j] =
    availableMoves[Math.floor(Math.random() * availableMoves.length)];
  gameState.board[i][j] = "O";
};

// Початок нової гри командою /start
bot.callbackQuery("game_tictactoe", async (ctx) => {
  await startNewGame(ctx);

  //   await ctx.reply(
  //     'Гра "Хрестики-Нулики" розпочата! Ви граєте за X, бот грає за O. Ваш хід.',
  //     {
  //       reply_markup: renderBoard(gameState!.board),
  //     }
  //   );
  ctx.answerCallbackQuery();
});

bot.callbackQuery("game_tictactoe_new", async (ctx) => {
  await startNewGame(ctx);

  ctx.answerCallbackQuery();
});

// Обробка ходу користувача та ходу бота
bot.callbackQuery(/^\d,\d$/, async (ctx) => {
  const gameKey = `${ctx.chat?.id}-${ctx.callbackQuery.message?.message_id}`;
  const gameState = gameStates[gameKey];

  if (!gameState || gameState.isGameOver) {
    await ctx.answerCallbackQuery("Гру завершено!");
    return;
  }
  const [i, j] = ctx.match[0].split(",").map(Number);

  // Перевірка, чи клітинка вже зайнята
  if (gameState.board[i][j]) {
    await ctx.answerCallbackQuery("Ця клітинка вже зайнята!");
    return;
  }

  // Хід користувача
  gameState.board[i][j] = "X";
  let winner = checkWinner(gameState.board);

  if (winner) {
    gameState.isGameOver = true;
    await ctx.editMessageText(`🎉 Ви перемогли!`, {
      reply_markup: renderBoard(gameState.board, true),
    });
    delete gameStates[gameKey]; // Видаляємо гру після завершення
    await ctx.answerCallbackQuery(`Ви перемогли!`);
    return;
  }

  if (gameState.board.flat().every((cell) => cell !== null)) {
    gameState.isGameOver = true;
    await ctx.editMessageText("🤝 Нічия!", {
      reply_markup: renderBoard(gameState.board, true),
    });
    delete gameStates[gameKey];
    await ctx.answerCallbackQuery("Нічия!");
    return;
  }

  // Хід бота
  botMove(gameState);
  winner = checkWinner(gameState.board);

  if (winner) {
    gameState.isGameOver = true;
    await ctx.editMessageText(`💥 Бот переміг!`, {
      reply_markup: renderBoard(gameState.board, true),
    });
    delete gameStates[gameKey];
    await ctx.answerCallbackQuery(`Бот переміг!`);
  } else if (gameState.board.flat().every((cell) => cell !== null)) {
    gameState.isGameOver = true;
    await ctx.editMessageText("🤝 Нічия!", {
      reply_markup: renderBoard(gameState.board, true),
    });
    delete gameStates[gameKey];
    await ctx.answerCallbackQuery("Нічия!");
  } else {
    await ctx.editMessageText("Ваш хід.", {
      reply_markup: renderBoard(gameState.board),
    });
  }
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
    result = "🤝 *Нічия\\!*";
  } else if (
    (userChoice === "gameStone" && botChoice === "gameScissors") ||
    (userChoice === "gameScissors" && botChoice === "gamePaper") ||
    (userChoice === "gamePaper" && botChoice === "gameStone")
  ) {
    result = "🎉 *Ти переміг\\!*";
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
    result = "💥 *Бот переміг\\!*";
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

// =========================== Start server =

const app = express();
app.use(bodyParser.json());
app.use(webhookCallback(bot, "express"));

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/webhook", (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

// Вказати URL для вебхуків
const setWebhook = async () => {
  try {
    const webhookUrl = `${process.env.BASE_URL}/webhook`;
    await bot.api.setWebhook(webhookUrl);
  } catch (error) {
    console.error("Помилка встановлення вебхуку:", error);
  }
};

setWebhook();

// Запустіть сервер
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущено на порту ${PORT}`);
});
