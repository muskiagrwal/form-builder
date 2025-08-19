// server.js
import express from "express";
import cors from "cors";
import session from "express-session";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

// Node 18+ has global fetch
dotenv.config();

/* ----------------------------- MongoDB setup ----------------------------- */
const client = new MongoClient(
  process.env.MONGODB_URI || "mongodb://localhost:27017/airtable-form-builder"
);
let db;
await client.connect();
db = client.db();
console.log("Connected to MongoDB");

/* ---------------------------- Express bootstrap -------------------------- */
const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

/* ------------------------------- Constants ------------------------------- */
const AIRTABLE_AUTH_URL = "https://airtable.com/oauth2/v1/authorize";
const AIRTABLE_TOKEN_URL = "https://airtable.com/oauth2/v1/token";
const AIRTABLE_API = "https://api.airtable.com/v0";

const OAUTH_SCOPES = [
  "data.records:read",
  "data.records:write",
  "schema.bases:read",
];

/* --------------------------- Helper: token utils -------------------------- */
function msFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000);
}

/**
 * Refresh tokens for a user doc (object with refreshToken, etc.).
 * Returns the updated user document (and persists to DB).
 */
async function refreshTokens(user) {
  if (!user?.refreshToken) {
    throw new Error("No refresh token available");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: user.refreshToken,
    client_id: process.env.AIRTABLE_CLIENT_ID,
    client_secret: process.env.AIRTABLE_CLIENT_SECRET,
  });

  const resp = await fetch(AIRTABLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON on refresh: ${text}`);
  }

  if (!resp.ok) {
    throw new Error(
      json.error_description || json.error || `HTTP ${resp.status} on refresh`
    );
  }

  const update = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? user.refreshToken, // may not always rotate
    tokenExpiresAt: json.expires_in ? msFromNow(json.expires_in) : null,
    updatedAt: new Date(),
  };

  await db.collection("users").updateOne(
    { airtableId: user.airtableId },
    { $set: update }
  );

  return { ...user, ...update };
}

/**
 * Ensure a valid access token; refresh if expired or near expiry.
 * Returns the user with a valid accessToken.
 */
async function ensureValidUserTokenById(airtableId) {
  let user = await db.collection("users").findOne({ airtableId });
  if (!user) throw new Error("User not found");

  const now = Date.now();
  const exp = user.tokenExpiresAt ? new Date(user.tokenExpiresAt).getTime() : 0;
  const isExpiredOrSoon = !exp || exp - now < 60 * 1000; // refresh if <60s left

  if (isExpiredOrSoon) {
    user = await refreshTokens(user);
  }
  return user;
}

/* ---------------------------- OAuth: start flow --------------------------- */
app.get("/auth/airtable", (req, res) => {
  // random state for CSRF
  const state =
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: process.env.AIRTABLE_CLIENT_ID,
    redirect_uri: process.env.AIRTABLE_REDIRECT_URI, // must EXACTLY match dev console
    response_type: "code",
    scope: OAUTH_SCOPES.join(" "), // URLSearchParams will encode spaces as %20
    state,
  });

  const authUrl = `${AIRTABLE_AUTH_URL}?${params.toString()}`;
  // return as JSON (front-end can window.location = authUrl)
  res.json({ authUrl });
});

/* --------------------------- OAuth: callback flow ------------------------- */
app.get("/auth/callback", async (req, res) => {
  const { code, error, state } = req.query;

  if (error) {
    return res.redirect(
      `${FRONTEND_URL}?auth=error&message=${encodeURIComponent(String(error))}`
    );
  }
  if (!code) {
    return res.redirect(
      `${FRONTEND_URL}?auth=error&message=${encodeURIComponent(
        "No authorization code received"
      )}`
    );
  }
  if (state !== req.session.oauthState) {
    return res.redirect(
      `${FRONTEND_URL}?auth=error&message=${encodeURIComponent(
        "Invalid state parameter"
      )}`
    );
  }

  try {
    // Exchange code for tokens
    const body = new URLSearchParams({
      client_id: process.env.AIRTABLE_CLIENT_ID,
      client_secret: process.env.AIRTABLE_CLIENT_SECRET,
      redirect_uri: process.env.AIRTABLE_REDIRECT_URI,
      code: String(code),
      grant_type: "authorization_code",
    });

    const tokenResp = await fetch(AIRTABLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "AirtableFormBuilder/1.0",
      },
      body,
    });

    const tokenText = await tokenResp.text();
    let tokens;
    try {
      tokens = JSON.parse(tokenText);
    } catch {
      throw new Error(`Invalid JSON response: ${tokenText}`);
    }
    if (!tokenResp.ok || !tokens.access_token) {
      throw new Error(
        tokens.error_description || tokens.error || "Token exchange failed"
      );
    }

    // Who am I
    const meResp = await fetch(`${AIRTABLE_API}/meta/whoami`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "User-Agent": "AirtableFormBuilder/1.0",
      },
    });
    if (!meResp.ok) {
      const t = await meResp.text();
      throw new Error(`Failed to fetch user profile: ${meResp.status} ${t}`);
    }
    const profile = await meResp.json();

    // Persist user
    const userUpdate = {
      airtableId: profile.id,
      email: profile.email,
      name: profile.name,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: tokens.expires_in ? msFromNow(tokens.expires_in) : null,
      lastLogin: new Date(),
      updatedAt: new Date(),
    };

    await db.collection("users").updateOne(
      { airtableId: profile.id },
      { $set: userUpdate },
      { upsert: true }
    );

    // Session
    req.session.userId = profile.id;
    req.session.accessToken = tokens.access_token;

    return res.redirect(`${FRONTEND_URL}?auth=success`);
  } catch (e) {
    return res.redirect(
      `${FRONTEND_URL}?auth=error&message=${encodeURIComponent(e.message)}`
    );
  }
});

/* ----------------------------- Debug + Logout ----------------------------- */
app.get("/debug/session", (req, res) => {
  res.json({
    sessionId: req.sessionID,
    userId: req.session.userId,
    hasAccessToken: !!req.session.accessToken,
    session: req.session,
  });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy((err) =>
    err ? res.status(500).json({ error: "Failed to logout" }) : res.json({ success: true })
  );
});

/* ------------------------------- User routes ------------------------------ */
app.get("/api/user", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  const user = await db
    .collection("users")
    .findOne({ airtableId: req.session.userId });
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    id: user.airtableId,
    email: user.email,
    name: user.name,
    lastLogin: user.lastLogin,
  });
});

/* -------------------------- Airtable meta endpoints ----------------------- */
app.get("/api/bases", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  try {
    const user = await ensureValidUserTokenById(req.session.userId);
    const r = await fetch(`${AIRTABLE_API}/meta/bases`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    res.json(data.bases || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/bases/:baseId/schema", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  try {
    const user = await ensureValidUserTokenById(req.session.userId);
    const r = await fetch(`${AIRTABLE_API}/meta/bases/${req.params.baseId}/tables`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    res.json(data.tables || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ------------------------------- Forms CRUD ------------------------------- */
app.post("/api/forms", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  try {
    const form = {
      ...req.body,
      userId: req.session.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await db.collection("forms").insertOne(form);
    res.json({ id: result.insertedId, ...form });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/forms/:id", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  try {
    const result = await db.collection("forms").updateOne(
      { _id: new ObjectId(req.params.id), userId: req.session.userId },
      { $set: { ...req.body, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0)
      return res.status(404).json({ error: "Form not found or unauthorized" });

    const updated = await db
      .collection("forms")
      .findOne({ _id: new ObjectId(req.params.id) });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/forms/:id", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  try {
    const result = await db.collection("forms").deleteOne({
      _id: new ObjectId(req.params.id),
      userId: req.session.userId,
    });
    if (result.deletedCount === 0)
      return res.status(404).json({ error: "Form not found or unauthorized" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/forms", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  try {
    const forms = await db
      .collection("forms")
      .find({ userId: req.session.userId })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(forms);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Public: fetch a form by ID
app.get("/api/forms/:id", async (req, res) => {
  try {
    const form = await db
      .collection("forms")
      .findOne({ _id: new ObjectId(req.params.id) });
    if (!form) return res.status(404).json({ error: "Form not found" });
    const { userId, ...publicForm } = form;
    res.json(publicForm);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ----------------------- Submissions (Bearer token) ----------------------- */
// Submit a form response (uses the *form owner's* token)
app.post("/api/forms/:id/submit", async (req, res) => {
  try {
    const form = await db
      .collection("forms")
      .findOne({ _id: new ObjectId(req.params.id) });
    if (!form) return res.status(404).json({ error: "Form not found" });

    // Ensure the owner has a fresh token
    const owner = await ensureValidUserTokenById(form.userId);

    if (!req.body.fields || Object.keys(req.body.fields).length === 0) {
      return res.status(400).json({ error: "No fields provided" });
    }

    const r = await fetch(`${AIRTABLE_API}/${form.baseId}/${encodeURIComponent(form.tableId)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${owner.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: req.body.fields }),
    });
    const data = await r.json();
    if (!r.ok) {
      return res
        .status(r.status)
        .json({ error: data?.error?.message || "Failed to create record" });
    }

    await db.collection("submissions").insertOne({
      formId: form._id,
      submissionData: req.body.fields,
      airtableRecordId: data.id,
      submittedAt: new Date(),
      ipAddress: req.ip,
    });

    res.json({ success: true, recordId: data.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Legacy direct create (now uses Bearer token from the session user)
 * POST /api/bases/:baseId/tables/:tableId/records
 * body: { fields: { ... } }
 */
app.post("/api/bases/:baseId/tables/:tableId/records", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  try {
    const user = await ensureValidUserTokenById(req.session.userId);

    const r = await fetch(
      `${AIRTABLE_API}/${req.params.baseId}/${encodeURIComponent(req.params.tableId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: req.body.fields }),
      }
    );

    const data = await r.json();
    if (!r.ok) {
      return res
        .status(r.status)
        .json({ error: data?.error?.message || "Failed to create record" });
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* -------------------------------- Utilities ------------------------------- */
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

/* --------------------------------- Start --------------------------------- */
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
