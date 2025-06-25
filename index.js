const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { MongoClient } = require("mongodb");
const winston = require("winston");

// ---------------- CONFIG ----------------
const BOT_TOKEN = "8187930101:AAFlyd5vSENSK9D_g7QSnDbGCHptKFnNpIw";
const MONGO_URI =
  "mongodb+srv://harshdvadhavana26:harshdv007@try.j3wxapq.mongodb.net/telegram_bot?retryWrites=true&w=majority";
const DB_NAME = "telegram_bot";
const COLLECTION_NAME = "users";
// ----------------------------------------

// Initialize Express and Telegram bot
const app = express();
app.use(express.json()); // Parse JSON request bodies
app.use(express.text()); // Parse raw text bodies as fallback
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Logging setup
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(
      ({ level, message, timestamp }) => `${timestamp} ${level}: ${message}`
    )
  ),
  transports: [new winston.transports.Console()],
});

// MongoDB setup
let collection;
let cachedUsers = [];

async function connectMongoDB() {
  try {
    const client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    const db = client.db(DB_NAME);
    collection = db.collection(COLLECTION_NAME);
    logger.info("✅ MongoDB connected successfully");
    await updateCachedUsers();
  } catch (e) {
    logger.error(`❌ MongoDB connection error: ${e}`);
    collection = null;
  }
}

async function updateCachedUsers() {
  if (collection) {
    cachedUsers = await collection
      .find({ chat_id: { $exists: true } })
      .toArray();
    logger.info(`✅ Cached ${cachedUsers.length} users from MongoDB`);
  }
}

connectMongoDB();

// Telegram /start handler
bot.onText(/\/start/, async (msg) => {
  const username = msg.from.username;
  const chatId = msg.chat.id;

  if (!username) {
    bot.sendMessage(chatId, "Set a Telegram username to register.");
    return;
  }

  if (!collection) {
    bot.sendMessage(chatId, "DB error. Try later.");
    return;
  }

  try {
    const user = await collection.findOne({ username });
    if (user) {
      await collection.updateOne({ username }, { $set: { chat_id: chatId } });
      await updateCachedUsers();
      bot.sendMessage(chatId, "You’re now registered to receive messages.");
    } else {
      bot.sendMessage(chatId, "You're not authorized to register.");
    }
  } catch (e) {
    logger.error(`❌ Error in /start handler: ${e}`);
    bot.sendMessage(chatId, "An error occurred. Try again later.");
  }
});

// Function to send messages to users
async function sendMessagesToUsers(message, users) {
  if (!users || users.length === 0) {
    logger.warn("⚠️ No users to send to");
    return;
  }

  // Convert non-string message to string (e.g., JSON objects, arrays)
  const messageText =
    typeof message === "string" ? message : JSON.stringify(message, null, 2);

  const tasks = users
    .filter((user) => user.chat_id)
    .map((user) => bot.sendMessage(user.chat_id, messageText));

  try {
    await Promise.all(tasks);
    logger.info(`✅ Message sent to ${tasks.length} users`);
  } catch (e) {
    logger.error(`❌ Error sending messages: ${e}`);
  }
}

// Express routes
app.post("/send_message", async (req, res) => {
  const start = Date.now();
  const message = req.body;

  // Check if message is empty or undefined
  if (
    message === undefined ||
    message === null ||
    (typeof message === "string" && !message.length) ||
    (typeof message === "object" && Object.keys(message).length === 0)
  ) {
    return res.status(400).json({ error: "Empty or invalid request body" });
  }

  if (!collection) {
    return res.status(500).json({ error: "MongoDB not connected" });
  }

  try {
    // Fetch fresh user list from MongoDB
    const users = await collection.find({}).toArray();
    if (!users || users.length === 0) {
      return res.status(500).json({ error: "No users found in DB" });
    }

    // Send messages to users
    sendMessagesToUsers(message, users);

    const duration = (Date.now() - start) / 1000;
    logger.info(`✅ Queued message in ${duration.toFixed(2)} seconds`);
    return res.status(200).json({ status: "Message queued" });
  } catch (e) {
    logger.error(`❌ Failed to query users: ${e}`);
    return res.status(500).json({ error: "MongoDB query failed" });
  }
});

app.get("/health", (req, res) => {
  res.json({ server: "running" });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
