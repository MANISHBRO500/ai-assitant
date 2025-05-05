const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// MongoDB setup
const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = 'ai_assistant_db';

let db, tasksCollection;

MongoClient.connect(mongoUrl, {useUnifiedTopology:true})
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

// Get tasks for today (filter by date)
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
    res.status(500).json({error: 'Failed to fetch tasks.'});
  }
});

// Add new task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, time } = req.body;
    if (!title || !time) return res.status(400).json({error: 'Task title and time required'});
    const now = new Date();
    const result = await tasksCollection.insertOne({
      title,
      time,
      createdAt: now,
    });
    res.json({success: true, taskId: result.insertedId});
  } catch (err) {
    res.status(500).json({error: 'Failed to add task.'});
  }
});

// Delete task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) return res.status(400).json({error: 'Invalid id'});
    await tasksCollection.deleteOne({_id: new ObjectId(id)});
    res.json({success: true});
  } catch (err) {
    res.status(500).json({error: 'Failed to delete task.'});
  }
});

// Query handler - process user query for multiple domains
app.post('/api/query', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({error: 'Query is required'});
  
  try {
    // Basic intent detection (naive)
    const lowerQuery = query.toLowerCase();
    
    // Weather intent
    if (lowerQuery.includes('weather')) {
      // extract city - naive approach
      const cityMatch = query.match(/in ([a-zA-Z ]+)/i);
      const city = cityMatch ? cityMatch[1] : 'New York';
      if (!OPENWEATHER_API_KEY) return res.json({text: 'Weather API key not configured.'});
      const weatherResp = await axios.get(\`https://api.openweathermap.org/data/2.5/weather?q=\${encodeURIComponent(city)}&appid=\${OPENWEATHER_API_KEY}&units=metric\`);
      const w = weatherResp.data;
      const description = w.weather[0].description;
      const temp = w.main.temp;
      const reply = \`Current weather in \${city}: \${description}, temperature is \${temp}°C.\`;
      return res.json({text: reply});
    }
    
    // Image intent
    if (lowerQuery.includes('show me') || lowerQuery.includes('image') || lowerQuery.includes('picture')) {
      if (!UNSPLASH_ACCESS_KEY) return res.json({text: 'Image API key not configured.'});
      // extract query for unsplash
      const unsplashQuery = query.replace(/show me|image|picture/gi, '').trim() || 'nature';
      const imageResp = await axios.get(\`https://api.unsplash.com/photos/random?query=\${encodeURIComponent(unsplashQuery)}&client_id=\${UNSPLASH_ACCESS_KEY}\`);
      const imageUrl = imageResp.data.urls.small;
      return res.json({text: \`Here is an image for "\${unsplashQuery}":\`, imageUrl});
    }

    // News intent
    if (lowerQuery.includes('news')) {
      if (!NEWS_API_KEY) return res.json({text: 'News API key not configured.'});
      const newsResp = await axios.get(\`https://newsapi.org/v2/top-headlines?country=us&apiKey=\${NEWS_API_KEY}&pageSize=3\`);
      const articles = newsResp.data.articles.map(a => \`- \${a.title}\`).join('\\n');
      return res.json({text: \`Latest news headlines:\\n\${articles}\`});
    }
    
    // Scheduling: Add task intent
    if (lowerQuery.startsWith('add task')) {
      // parse like "add task to buy groceries at 17:00"
      const matches = query.match(/add task (.+) at (\\d{1,2}:\\d{2})/i);
      if (matches) {
        const taskTitle = matches[1].trim();
        const taskTime = matches[2];
        const now = new Date();
        await tasksCollection.insertOne({title: taskTitle, time: taskTime, createdAt: now});
        return res.json({text: \`Task "\${taskTitle}" added for \${taskTime}.\`, tasksUpdated: true});
      }
      return res.json({text: 'Please specify task and time like: "Add task buy groceries at 17:00".'});
    }

    // Default: use Google Gemini API for general questions (if configured)
    if (!GEMINI_API_KEY) return res.json({text: 'I do not understand that yet, and Gemini API key is not configured.'});

    // Example Gemini API call (replace URL and body according to Gemini API docs)
    const geminiResponse = await axios.post(
      'https://gemini.googleapis.com/v1/models/text-bison-001:predict', // Example endpoint - replace with real
      {
        instances: [{ content: query }],
        parameters: { temperature: 0.7, maxOutputTokens: 256 }
      },
      {
        headers: {
          'Authorization': \`Bearer \${GEMINI_API_KEY}\`,
          'Content-Type': 'application/json',
        },
      }
    );

    const aiText = geminiResponse.data.predictions?.[0]?.content || 'Sorry, no response from Gemini AI.';
    res.json({ text: aiText });

  } catch(err) {
    console.error('Query error:', err.response?.data || err.message || err);
    res.status(500).json({error: 'Internal server error processing query.'});
  }

});

// Serve a simple health check
app.get('/', (req, res) => {
  res.send('AI Assistant Backend Running');
});

app.listen(port, () => {
  console.log(\`Server running at http://localhost:\${port}\`);
});
