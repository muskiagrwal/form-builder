import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import Login from './components/Login'
import FormBuilder from './components/FormBuilder'
import FormRenderer from './components/FormRenderer'
import FormViewer from './components/FormViewer'
import Dashboard from './components/Dashboard'

const API_BASE = 'http://localhost:3001'

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [bases, setBases] = useState([])
  const [currentView, setCurrentView] = useState('dashboard')
  const [formConfig, setFormConfig] = useState(null)
  const [savedFormId, setSavedFormId] = useState(null)
  const navigate = useNavigate()

  const fetchUserAndBases = async () => {
    try {
      const [userResponse, basesResponse] = await Promise.all([
        fetch(`${API_BASE}/api/user`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/bases`, { credentials: 'include' })
      ])
      
      if (userResponse.ok && basesResponse.ok) {
        const userData = await userResponse.json()
        const basesData = await basesResponse.json()
        setUser(userData)
        setBases(basesData)
        setIsAuthenticated(true)
      }
    } catch (error) {
      console.error('Failed to fetch user data:', error)
    }
  }

  const saveForm = async (config) => {
    try {
      const response = await fetch(`${API_BASE}/api/forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(config)
      })
      const savedForm = await response.json()
      setSavedFormId(savedForm.id)
      setFormConfig(config)
      alert(`Form saved! Share this URL: ${window.location.origin}/form/${savedForm.id}`)
    } catch (error) {
      alert('Failed to save form: ' + error.message)
    }
  }

  useEffect(() => {
    fetchUserAndBases()
  }, [])

  if (!isAuthenticated) {
    return <Login onLogin={() => fetchUserAndBases()} />
  }

  return (
    <div className="container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1>Airtable Form Builder</h1>
          {user && <p style={{ margin: '5px 0', color: '#666' }}>Welcome, {user.name} ({user.email})</p>}
        </div>
        <div>
          <button 
            className={`btn ${currentView === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setCurrentView('dashboard')}
          >
            Dashboard
          </button>
          <button 
            className={`btn ${currentView === 'builder' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setCurrentView('builder')}
            style={{ marginLeft: '10px' }}
          >
            Builder
          </button>
          <button 
            className={`btn ${currentView === 'preview' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setCurrentView('preview')}
            style={{ marginLeft: '10px' }}
            disabled={!formConfig}
          >
            Preview
          </button>
        </div>
      </header>

      {currentView === 'dashboard' ? (
        <Dashboard />
      ) : currentView === 'builder' ? (
        <FormBuilder bases={bases} onFormSave={saveForm} />
      ) : (
        <FormRenderer formConfig={formConfig} />
      )}
    </div>
  )
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AppContent />} />
        <Route path="/form/:id" element={<FormViewer />} />
      </Routes>
    </Router>
  )
}

export default App