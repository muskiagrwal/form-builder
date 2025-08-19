# Airtable Form Builder

A full-stack application that allows users to authenticate with Airtable, create custom forms using their base fields, apply conditional logic, and save responses directly to Airtable.

## Features

- Airtable OAuth authentication
- Dynamic form creation from Airtable base fields
- Conditional logic (show/hide fields based on values)
- Direct form submission to Airtable
- Real-time form preview

## Setup

1. **Install dependencies:**
   ```bash
   npm run install-all
   ```

2. **Configure Airtable OAuth:**
   - Go to https://airtable.com/developers/web/api/oauth-integration
   - Create a new OAuth integration
   - Set redirect URI to: `http://localhost:3000/callback.html`
   - Copy your Client ID and Client Secret

3. **Environment setup:**
   ```bash
   cd server
   cp .env.example .env
   ```
   
   Edit `.env` with your Airtable credentials:
   ```
   AIRTABLE_CLIENT_ID=your_client_id
   AIRTABLE_CLIENT_SECRET=your_client_secret
   AIRTABLE_REDIRECT_URI=http://localhost:3000/callback.html
   SESSION_SECRET=your_random_secret
   PORT=3001
   ```

4. **Run the application:**
   ```bash
   npm run dev
   ```

   This starts both the React frontend (port 3000) and Express backend (port 3001).

## Usage

1. **Login:** Click "Login with Airtable" to authenticate
2. **Select Base & Table:** Choose which Airtable base and table to use
3. **Build Form:** Add fields from your Airtable table to the form
4. **Add Conditions:** Set up conditional logic to show/hide fields
5. **Preview:** Switch to preview mode to test your form
6. **Submit:** Form responses are saved directly to your Airtable base

## Architecture

- **Frontend:** React with Vite
- **Backend:** Node.js/Express
- **Authentication:** Airtable OAuth 2.0
- **Data Storage:** Direct to Airtable via API

## API Endpoints

- `GET /auth/airtable` - Get OAuth URL
- `POST /auth/callback` - Handle OAuth callback
- `GET /api/bases` - List user's bases
- `GET /api/bases/:id/schema` - Get base schema
- `POST /api/bases/:baseId/tables/:tableId/records` - Submit form data