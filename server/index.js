import express from 'express';
import cors from 'cors';
import session from 'express-session';
import dotenv from 'dotenv';
import Airtable from 'airtable';
import { MongoClient, ObjectId } from 'mongodb';

dotenv.config();

const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017/airtable-form-builder');
let db;

client.connect().then(() => {
  db = client.db();
  console.log('Connected to MongoDB');
}).catch(console.error);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Airtable OAuth routes
app.get('/auth/airtable', (req, res) => {
  const authUrl = `https://airtable.com/oauth2/v1/authorize?client_id=${process.env.AIRTABLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.AIRTABLE_REDIRECT_URI)}&response_type=code&scope=data.records:read data.records:write schema.bases:read`;
  res.json({ authUrl });
});

app.post('/auth/callback', async (req, res) => {
  const { code } = req.body;
  try {
    const response = await fetch('https://airtable.com/oauth2/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AIRTABLE_CLIENT_ID,
        client_secret: process.env.AIRTABLE_CLIENT_SECRET,
        redirect_uri: process.env.AIRTABLE_REDIRECT_URI,
        code,
        grant_type: 'authorization_code'
      })
    });
    const tokens = await response.json();
    
    // Get user profile
    const profileResponse = await fetch('https://api.airtable.com/v0/meta/whoami', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    const profile = await profileResponse.json();
    
    // Save user to MongoDB
    await db.collection('users').updateOne(
      { airtableId: profile.id },
      {
        $set: {
          airtableId: profile.id,
          email: profile.email,
          name: profile.name,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          lastLogin: new Date()
        }
      },
      { upsert: true }
    );
    
    req.session.userId = profile.id;
    req.session.accessToken = tokens.access_token;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user profile
app.get('/api/user', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  
  try {
    const user = await db.collection('users').findOne({ airtableId: req.session.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({
      id: user.airtableId,
      email: user.email,
      name: user.name,
      lastLogin: user.lastLogin
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's bases
app.get('/api/bases', async (req, res) => {
  if (!req.session.accessToken) return res.status(401).json({ error: 'Not authenticated' });
  
  try {
    const response = await fetch('https://api.airtable.com/v0/meta/bases', {
      headers: { 'Authorization': `Bearer ${req.session.accessToken}` }
    });
    const data = await response.json();
    res.json(data.bases);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get base schema
app.get('/api/bases/:baseId/schema', async (req, res) => {
  if (!req.session.accessToken) return res.status(401).json({ error: 'Not authenticated' });
  
  try {
    const response = await fetch(`https://api.airtable.com/v0/meta/bases/${req.params.baseId}/tables`, {
      headers: { 'Authorization': `Bearer ${req.session.accessToken}` }
    });
    const data = await response.json();
    res.json(data.tables);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save form configuration
app.post('/api/forms', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  
  try {
    const form = {
      ...req.body,
      userId: req.session.userId,
      createdAt: new Date()
    };
    const result = await db.collection('forms').insertOne(form);
    res.json({ id: result.insertedId, ...form });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's forms
app.get('/api/forms', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  
  try {
    const forms = await db.collection('forms').find({ userId: req.session.userId }).toArray();
    res.json(forms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get form by ID
app.get('/api/forms/:id', async (req, res) => {
  try {
    const form = await db.collection('forms').findOne({ _id: new ObjectId(req.params.id) });
    if (!form) return res.status(404).json({ error: 'Form not found' });
    res.json(form);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit form response
app.post('/api/forms/:id/submit', async (req, res) => {
  try {
    const form = await db.collection('forms').findOne({ _id: new ObjectId(req.params.id) });
    if (!form) return res.status(404).json({ error: 'Form not found' });
    
    const user = await db.collection('users').findOne({ airtableId: form.userId });
    if (!user) return res.status(404).json({ error: 'Form owner not found' });
    
    const base = new Airtable({ apiKey: user.accessToken }).base(form.baseId);
    const record = await base(form.tableId).create(req.body.fields);
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit form response (legacy endpoint)
app.post('/api/bases/:baseId/tables/:tableId/records', async (req, res) => {
  if (!req.session.accessToken) return res.status(401).json({ error: 'Not authenticated' });
  
  try {
    const base = new Airtable({ apiKey: req.session.accessToken }).base(req.params.baseId);
    const record = await base(req.params.tableId).create(req.body.fields);
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));