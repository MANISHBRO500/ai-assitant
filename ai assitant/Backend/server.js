// Ensure at the top after requiring dotenv:
require('dotenv').config();

// Then in the API handler route:

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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
    if (lowerQuery.includes('show me') || lowerQuery.includes('image') || lowerQuery.includes('picture')) {
      if (!UNSPLASH_ACCESS_KEY) return res.json({ text: 'Image API key not configured.' });

      const unsplashQuery = query.replace(/show me|image|picture/gi, '').trim() || 'nature';

      const imageResp = await axios.get(
        `https://api.unsplash.com/photos/random?query=${encodeURIComponent(unsplashQuery)}&client_id=${UNSPLASH_ACCESS_KEY}`
      );

      const imageUrl = imageResp.data.urls.small;

      return res.json({ text: `Here is an image for "${unsplashQuery}":`, imageUrl });
    }

    // News intent
    if (lowerQuery.includes('news')) {
      if (!NEWS_API_KEY) return res.json({ text: 'News API key not configured.' });

      const newsUrl = `https://newsapi.org/v2/top-headlines?country=us&apiKey=${NEWS_API_KEY}&pageSize=3`;

      const newsResp = await axios.get(newsUrl);

      const articles = newsResp.data.articles.map((a) => `- ${a.title}`).join('\n');

      return res.json({ text: `Latest news headlines:\n${articles}` });
    }

    // Add task intent and other logic here...

    // Default: use Gemini API if configured
    if (!GEMINI_API_KEY) return res.json({ text: 'I do not understand that yet, and Gemini API key is not configured.' });

    // Replace the following with your actual Gemini API endpoint and request format
    const geminiResponse = await axios.post(
      'https://gemini.googleapis.com/v1/models/text-bison-001:predict',
      {
        instances: [{ content: query }],
        parameters: { temperature: 0.7, maxOutputTokens: 256 },
      },
      {
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const aiText = geminiResponse.data.predictions?.[0]?.content || 'Sorry, no response from Gemini AI.';

    return res.json({ text: aiText });
  } catch (err) {
    console.error('Query error:', err.response?.data || err.message || err);
    res.status(500).json({ error: 'Internal server error processing query.' });
  }
});
