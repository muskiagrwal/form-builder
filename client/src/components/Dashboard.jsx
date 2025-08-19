import React, { useState, useEffect } from 'react'

const API_BASE = 'http://localhost:3001'

function Dashboard() {
  const [forms, setForms] = useState([])

  useEffect(() => {
    const fetchForms = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/forms`, { credentials: 'include' })
        if (response.ok) {
          const data = await response.json()
          setForms(data)
        }
      } catch (error) {
        console.error('Failed to fetch forms:', error)
      }
    }
    fetchForms()
  }, [])

  const copyFormUrl = (formId) => {
    const url = `${window.location.origin}/form/${formId}`
    navigator.clipboard.writeText(url)
    alert('Form URL copied to clipboard!')
  }

  return (
    <div className="card">
      <h3>My Forms</h3>
      {forms.length === 0 ? (
        <p>No forms created yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: '15px' }}>
          {forms.map(form => (
            <div key={form._id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '4px' }}>
              <h4>Form ({form.fields?.length || 0} fields)</h4>
              <p style={{ color: '#666', fontSize: '14px' }}>
                Created: {new Date(form.createdAt).toLocaleDateString()}
              </p>
              <div style={{ marginTop: '10px' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={() => copyFormUrl(form._id)}
                  style={{ marginRight: '10px' }}
                >
                  Copy Form URL
                </button>
                <a 
                  href={`/form/${form._id}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                >
                  Preview Form
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Dashboard