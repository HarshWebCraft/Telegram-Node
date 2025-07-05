// const express = require("express");
// const TelegramBot = require("node-telegram-bot-api");
// const { MongoClient } = require("mongodb");
// const winston = require("winston");

// // ---------------- CONFIG ----------------
// const BOT_TOKEN = "8187930101:AAFlyd5vSENSK9D_g7QSnDbGCHptKFnNpIw";
// const MONGO_URI =
//   "mongodb+srv://harshdvadhavana26:harshdv007@try.j3wxapq.mongodb.net/ntrading?retryWrites=true&w=majority";
// const DB_NAME = "ntrading";
// const COLLECTION_NAME = "telegrams";
// // ----------------------------------------

// // Initialize Express and Telegram bot
// const app = express();
// app.use(express.json()); // Parse JSON request bodies
// app.use(express.text()); // Parse raw text bodies as fallback
// const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// // Logging setup
// const logger = winston.createLogger({
//   level: "info",
//   format: winston.format.combine(
//     winston.format.timestamp(),
//     winston.format.printf(
//       ({ level, message, timestamp }) => `${timestamp} ${level}: ${message}`
//     )
//   ),
//   transports: [new winston.transports.Console()],
// });

// // MongoDB setup
// let collection;
// let cachedUsers = [];

// async function connectMongoDB() {
//   try {
//     const client = new MongoClient(MONGO_URI, {
//       serverSelectionTimeoutMS: 5000,
//     });
//     await client.connect();
//     const db = client.db(DB_NAME);
//     collection = db.collection(COLLECTION_NAME);
//     logger.info("✅ MongoDB connected successfully");
//     await updateCachedUsers();
//   } catch (e) {
//     logger.error(`❌ MongoDB connection error: ${e}`);
//     collection = null;
//   }
// }

// async function updateCachedUsers() {
//   if (collection) {
//     cachedUsers = await collection
//       .find({ chat_id: { $exists: true } })
//       .toArray();
//     logger.info(`✅ Cached ${cachedUsers.length} users from MongoDB`);
//   }
// }

// connectMongoDB();

// // Telegram /start handler
// bot.onText(/\/start/, async (msg) => {
//   const username = msg.from.username;
//   const chatId = msg.chat.id;

//   if (!username) {
//     bot.sendMessage(chatId, "Set a Telegram username to register.");
//     return;
//   }

//   if (!collection) {
//     bot.sendMessage(chatId, "DB error. Try later.");
//     return;
//   }

//   try {
//     const user = await collection.findOne({ username });
//     if (user) {
//       await collection.updateOne({ username }, { $set: { chat_id: chatId } });
//       await updateCachedUsers();
//       bot.sendMessage(chatId, "You’re now registered to receive messages.");
//     } else {
//       bot.sendMessage(chatId, "You're not authorized to register.");
//     }
//   } catch (e) {
//     logger.error(`❌ Error in /start handler: ${e}`);
//     bot.sendMessage(chatId, "An error occurred. Try again later.");
//   }
// });

// // Function to send messages to users
// async function sendMessagesToUsers(message, users) {
//   if (!users || users.length === 0) {
//     logger.warn("⚠️ No users to send to");
//     return;
//   }

//   // Convert non-string message to string (e.g., JSON objects, arrays)
//   const messageText =
//     typeof message === "string" ? message : JSON.stringify(message, null, 2);

//   const tasks = users
//     .filter((user) => user.chat_id)
//     .map((user) => bot.sendMessage(user.chat_id, messageText));

//   try {
//     await Promise.all(tasks);
//     logger.info(`✅ Message sent to ${tasks.length} users`);
//   } catch (e) {
//     logger.error(`❌ Error sending messages: ${e}`);
//   }
// }

// // Express routes
// app.post("/send_message", async (req, res) => {
//   const start = Date.now();
//   const message = req.body;

//   // Check if message is empty or undefined
//   if (
//     message === undefined ||
//     message === null ||
//     (typeof message === "string" && !message.length) ||
//     (typeof message === "object" && Object.keys(message).length === 0)
//   ) {
//     return res.status(400).json({ error: "Empty or invalid request body" });
//   }

//   if (!collection) {
//     return res.status(500).json({ error: "MongoDB not connected" });
//   }

//   try {
//     // Fetch fresh user list from MongoDB
//     const users = await collection.find({}).toArray();
//     if (!users || users.length === 0) {
//       return res.status(500).json({ error: "No users found in DB" });
//     }

//     // Send messages to users
//     sendMessagesToUsers(message, users);

//     const duration = (Date.now() - start) / 1000;
//     logger.info(`✅ Queued message in ${duration.toFixed(2)} seconds`);
//     return res.status(200).json({ status: "Message queued" });
//   } catch (e) {
//     logger.error(`❌ Failed to query users: ${e}`);
//     return res.status(500).json({ error: "MongoDB query failed" });
//   }
// });

// app.get("/health", (req, res) => {
//   res.json({ server: "running" });
// });

// // Start server
// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   logger.info(`Server running on port ${PORT}`);
// });

require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { MongoClient, ObjectId } = require("mongodb");
const winston = require("winston");

// ---------------- CONFIG ----------------
const DB_NAME = "ntrading";
const TELEGRAMS_COLLECTION = "telegrams";
const SIGNALS_COLLECTION = "signals";
// ----------------------------------------

// Initialize Express
const app = express();
app.use(express.json()); // Parse JSON request bodies
app.use(express.text()); // Parse raw text bodies as fallback

// Logging setup
const logger = winston.createLogger({
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(
      ({ level, message, timestamp }) =>
        `${timestamp} ${level.toUpperCase()}: ${message}`
    )
  ),
  transports: [new winston.transports.Console()],
});

// MongoDB setup
let signalsCollection;
let telegramsCollection;
const bots = new Map(); // Map to store bot instances by token
const cachedUsersBySignal = new Map(); // Map to cache users by signalId

async function connectMongoDB() {
  logger.debug("Attempting to connect to MongoDB");
  try {
    const client = new MongoClient(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    logger.info("MongoDB client connected");
    const db = client.db(DB_NAME);
    signalsCollection = db.collection(SIGNALS_COLLECTION);
    telegramsCollection = db.collection(TELEGRAMS_COLLECTION);
    logger.info("✅ MongoDB connected successfully, database: " + DB_NAME);
    await initializeBots();
    await updateCachedUsers();
  } catch (e) {
    logger.error(`❌ MongoDB connection error: ${e.message}`);
    signalsCollection = null;
    telegramsCollection = null;
  }
}

// Function to validate Telegram bot token format
function isValidBotToken(token) {
  const tokenRegex = /^\d+:[A-Za-z0-9_-]{35}$/;
  return tokenRegex.test(token);
}

async function initializeBots() {
  logger.debug("Initializing Telegram bots");
  try {
    const signals = await signalsCollection
      .find({ ID: { $exists: true } })
      .toArray();
    logger.debug(
      `Found ${signals.length} signals in ${SIGNALS_COLLECTION} collection`
    );
    for (const signal of signals) {
      if (signal.ID) {
        logger.debug(`Processing signal ${signal._id} with token ${signal.ID}`);
        if (!isValidBotToken(signal.ID)) {
          logger.warn(
            `⚠️ Invalid bot token format for signal ${signal._id}: ${signal.ID}`
          );
          continue;
        }
        try {
          const bot = new TelegramBot(signal.ID, { polling: true });
          bots.set(signal.ID, bot);
          bot.onText(/\/start/, async (msg) => {
            logger.debug(`Received /start command for bot token ${signal.ID}`);
            await handleStart(signal.ID, signal._id, msg);
          });
          logger.info(
            `✅ Initialized bot for signal ${signal._id} with token ${signal.ID}`
          );
        } catch (e) {
          logger.error(
            `❌ Failed to initialize bot for signal ${signal._id}: ${e.message}`
          );
        }
      } else {
        logger.warn(`⚠️ Signal ${signal._id} has no bot token`);
      }
    }
    logger.info(`✅ Initialized ${bots.size} bots`);
  } catch (e) {
    logger.error(`❌ Error initializing bots: ${e.message}`);
  }
}

async function updateCachedUsers() {
  logger.debug("Updating cached users");
  if (telegramsCollection && signalsCollection) {
    try {
      const users = await telegramsCollection
        .find({ chat_id: { $exists: true }, signalId: { $exists: true } })
        .toArray();
      logger.debug(
        `Found ${users.length} users in ${TELEGRAMS_COLLECTION} collection`
      );
      cachedUsersBySignal.clear();
      logger.debug("Cleared cached users map");
      for (const user of users) {
        const signalId = user.signalId.toString();
        if (!cachedUsersBySignal.has(signalId)) {
          cachedUsersBySignal.set(signalId, []);
          logger.debug(`Created cache entry for signalId ${signalId}`);
        }
        cachedUsersBySignal.get(signalId).push(user);
        logger.debug(`Cached user ${user.username} for signalId ${signalId}`);
      }
      logger.info(`✅ Cached users for ${cachedUsersBySignal.size} signals`);
    } catch (e) {
      logger.error(`❌ Error updating cached users: ${e.message}`);
    }
  } else {
    logger.warn(
      "⚠️ Cannot update cached users: MongoDB collections not initialized"
    );
  }
}

async function handleStart(botToken, signalId, msg) {
  const username = msg.from.username;
  const chatId = msg.chat.id;
  logger.debug(
    `Handling /start command for botToken ${botToken}, signalId ${signalId}, chatId ${chatId}, username ${
      username || "none"
    }`
  );

  if (!username) {
    logger.warn(`⚠️ No username provided for chatId ${chatId}`);
    try {
      await bots
        .get(botToken)
        .sendMessage(chatId, "Set a Telegram username to register.");
      logger.info(`Sent username required message to chatId ${chatId}`);
    } catch (e) {
      logger.error(
        `❌ Error sending username required message to chatId ${chatId}: ${e.message}`
      );
    }
    return;
  }

  if (!telegramsCollection || !signalsCollection) {
    logger.error("❌ MongoDB collections not initialized");
    try {
      await bots.get(botToken).sendMessage(chatId, "DB error. Try later.");
      logger.info(`Sent DB error message to chatId ${chatId}`);
    } catch (e) {
      logger.error(
        `❌ Error sending DB error message to chatId ${chatId}: ${e.message}`
      );
    }
    return;
  }

  try {
    logger.debug(
      `Querying user with username ${username} and signalId ${signalId}`
    );
    const user = await telegramsCollection.findOne({
      username,
      signalId: new ObjectId(signalId),
    });
    if (user) {
      logger.debug(
        `Found user ${username} for signalId ${signalId}, updating chat_id to ${chatId}`
      );
      await telegramsCollection.updateOne(
        { username, signalId: new ObjectId(signalId) },
        { $set: { chat_id: chatId, updatedAt: new Date() } }
      );
      logger.info(`Updated chat_id for user ${username} to ${chatId}`);
      await updateCachedUsers();
      await bots
        .get(botToken)
        .sendMessage(
          chatId,
          "You’re now registered to receive messages for this signal."
        );
      logger.info(`✅ Sent registration confirmation to chatId ${chatId}`);
    } else {
      logger.warn(
        `⚠️ User ${username} not authorized for signalId ${signalId}`
      );
      await bots
        .get(botToken)
        .sendMessage(chatId, "You're not authorized for this signal.");
      logger.info(`Sent unauthorized message to chatId ${chatId}`);
    }
  } catch (e) {
    logger.error(
      `❌ Error in /start handler for bot ${botToken}: ${e.message}`
    );
    try {
      await bots
        .get(botToken)
        .sendMessage(chatId, "An error occurred. Try again later.");
      logger.info(`Sent error message to chatId ${chatId}`);
    } catch (err) {
      logger.error(
        `❌ Error sending error message to chatId ${chatId}: ${err.message}`
      );
    }
  }
}

async function sendMessagesToUsers(botToken, message, users) {
  logger.debug(`Sending message to ${users.length} users via bot ${botToken}`);
  if (!users || users.length === 0) {
    logger.warn(`⚠️ No users to send to for bot ${botToken}`);
    return;
  }

  const messageText =
    typeof message === "string" ? message : JSON.stringify(message, null, 2);
  logger.debug(`Message content: ${messageText}`);
  const bot = bots.get(botToken);

  if (!bot) {
    logger.error(`❌ No bot found for token ${botToken}`);
    return;
  }

  const tasks = users
    .filter((user) => user.chat_id)
    .map((user) => {
      logger.debug(
        `Queuing message for user ${user.username} (chatId ${user.chat_id})`
      );
      return bot.sendMessage(user.chat_id, messageText);
    });

  try {
    await Promise.all(tasks);
    logger.info(`✅ Message sent to ${tasks.length} users via bot ${botToken}`);
  } catch (e) {
    logger.error(`❌ Error sending messages via bot ${botToken}: ${e.message}`);
  }
}

// Express routes
app.post("/send_message", async (req, res) => {
  const start = Date.now();
  const { message, signalId } = req.body;
  logger.debug(
    `Received /send_message request: signalId=${signalId}, message=${JSON.stringify(
      message
    )}`
  );

  if (!message || !signalId) {
    logger.warn("⚠️ Missing message or signalId in /send_message request");
    return res.status(400).json({ error: "Message and signalId are required" });
  }

  if (!signalsCollection || !telegramsCollection) {
    logger.error("❌ MongoDB collections not initialized");
    return res.status(500).json({ error: "MongoDB not connected" });
  }

  try {
    logger.debug(`Querying signal with _id ${signalId}`);
    const signal = await signalsCollection.findOne({
      _id: new ObjectId(signalId),
    });
    if (!signal || !signal.ID) {
      logger.warn(`⚠️ Invalid signalId ${signalId} or bot token not found`);
      return res
        .status(400)
        .json({ error: "Invalid signalId or bot token not found" });
    }
    logger.debug(`Found signal ${signalId} with bot token ${signal.ID}`);

    if (!isValidBotToken(signal.ID)) {
      logger.warn(
        `⚠️ Invalid bot token format for signal ${signalId}: ${signal.ID}`
      );
      return res
        .status(400)
        .json({ error: `Invalid bot token for signal ${signalId}` });
    }

    const users = cachedUsersBySignal.get(signalId.toString()) || [];
    logger.debug(`Found ${users.length} users for signalId ${signalId}`);
    if (!users || users.length === 0) {
      logger.warn(`⚠️ No authorized users found for signal ${signalId}`);
      return res
        .status(404)
        .json({ error: "No authorized users found for this signal" });
    }

    sendMessagesToUsers(signal.ID, message, users);

    const duration = (Date.now() - start) / 1000;
    logger.info(
      `✅ Queued message for signal ${signalId} in ${duration.toFixed(
        2
      )} seconds`
    );
    return res.status(200).json({ status: "Message queued" });
  } catch (e) {
    logger.error(`❌ Failed to process send_message: ${e.message}`);
    return res.status(500).json({ error: "Failed to send message" });
  }
});

app.get("/health", (req, res) => {
  logger.debug("Received /health request");
  res.json({ server: "running", bots: bots.size });
  logger.info(`✅ Responded to /health request: ${bots.size} bots active`);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  connectMongoDB();
});
