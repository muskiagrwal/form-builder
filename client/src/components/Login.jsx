import React from 'react'

const API_BASE = 'http://localhost:3001'

function Login({ onLogin }) {
  const handleLogin = async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/airtable`)
      const { authUrl } = await response.json()
      
      const popup = window.open(authUrl, 'airtable-auth', 'width=600,height=600')
      
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed)
          onLogin()
        }
      }, 1000)
    } catch (error) {
      console.error('Login failed:', error)
    }
  }

  return (
    <div className="container">
      <div className="card" style={{ textAlign: 'center', marginTop: '100px' }}>
        <h2>Welcome to Airtable Form Builder</h2>
        <p style={{ margin: '20px 0' }}>Connect your Airtable account to start building forms</p>
        <button className="btn btn-primary" onClick={handleLogin}>
          Login with Airtable
        </button>
      </div>
    </div>
  )
}

export default Login