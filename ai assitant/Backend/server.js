// Import required modules
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config(); // Load environment variables from .env file

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB setup
const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = 'ai_assistant_db';

let db, tasksCollection;

MongoClient.connect(mongoUrl, { useUnifiedTopology: true })
  .then(client => {
    db = client.db(dbName);
    tasksCollection = db.collection('tasks');
    console.log('Connected to MongoDB');
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
  });

// API Keys from environment variables
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Routes

// Get tasks for today
app.get('/api/tasks/today', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const tasks = await tasksCollection.find({
      createdAt: {
        $gte: todayStart,
        $lt: todayEnd
      }
    }).toArray();
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks.' });
  }
});

// Add new task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, time } = req.body;
    if (!title || !time) return res.status(400).json({ error: 'Task title and time required' });
    const now = new Date();
    const result = await tasksCollection.insertOne({
      title,
      time,
      createdAt: now,
    });
    res.json({ success: true, taskId: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add task.' });
  }
});

// Delete task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    await tasksCollection.deleteOne({ _id: new ObjectId(id) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task.' });
  }
});

// Query handler
app.post('/api/query', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });

  try {
    const lowerQuery = query.toLowerCase();

    // Weather intent
    if (lowerQuery.includes('weather')) {
      const cityMatch = query.match(/in ([a-zA-Z ]+)/i);
      const city = cityMatch ? cityMatch[1].trim() : 'New York';

      if (!OPENWEATHER_API_KEY) {
        return res.json({ text: 'Weather API key not configured.' });
      }

      const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${OPENWEATHER_API_KEY}&units=metric`;

      const weatherResp = await axios.get(weatherUrl);
      const w = weatherResp.data;
      const description = w.weather[0].description;
      const temp = w.main.temp;
      const reply = `Current weather in ${city}: ${description}, temperature is ${temp}°C.`;
      return res.json({ text: reply });
    }

    // Image intent
    if (lowerQuery.includes('image') || lowerQuery.includes('photo') || lowerQuery.includes('picture')) {
      if (!UNSPLASH_ACCESS_KEY) {
        return res.json({ text: 'Image API key not configured.' });
      }

      const imageQuery = query.replace(/(show me|image|photo|picture) of /i, '').trim();
      const unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(imageQuery)}&client_id=${UNSPLASH_ACCESS_KEY}`;

      const imageResp = await axios.get(unsplashUrl);
      const results = imageResp.data.results;

      if (results.length > 0) {
        const imageUrl = results[0].urls.regular;
        return res.json({ image: imageUrl });
      } else {
        return res.json({ text: 'No image found for your query.' });
      }
    }

    // News intent
    if (lowerQuery.includes('news')) {
      if (!NEWS_API_KEY) {
        return res.json({ text: 'News API key not configured.' });
      }

      const newsUrl = `https://newsapi.org/v2/top-headlines?country=in&apiKey=${NEWS_API_KEY}`;
      const newsResp = await axios.get(newsUrl);
      const articles = newsResp.data.articles.slice(0, 3);

      const headlines = articles.map((a, i) => `${i + 1}. ${a.title}`).join('\n');
      return res.json({ text: `Top news headlines:\n${headlines}` });
    }

    // Fallback
    return res.json({ text: `Sorry, I couldn't understand your query.` });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong while processing the query.' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
