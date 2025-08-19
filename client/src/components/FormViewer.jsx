import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import PDFExport from './PDFExport'

const API_BASE = 'http://localhost:3001'

function FormViewer() {
  const { id } = useParams()
  const [formConfig, setFormConfig] = useState(null)
  const [formData, setFormData] = useState({})
  const [visibleFields, setVisibleFields] = useState(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [validationErrors, setValidationErrors] = useState({})

  useEffect(() => {
    const fetchForm = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/forms/${id}`)
        if (response.ok) {
          const form = await response.json()
          setFormConfig(form)
          setVisibleFields(new Set(form.fields.map(f => f.id)))
        } else {
          alert('Form not found')
        }
      } catch (error) {
        alert('Failed to load form: ' + error.message)
      } finally {
        setLoading(false)
      }
    }
    fetchForm()
  }, [id])

  const handleFieldChange = (fieldId, value) => {
    const newFormData = { ...formData, [fieldId]: value }
    setFormData(newFormData)
    
    // Apply conditional logic
    const newVisibleFields = new Set(formConfig.fields.map(f => f.id))
    
    formConfig.conditions.forEach(condition => {
      const triggerValue = newFormData[condition.fieldId]
      
      if (triggerValue !== undefined) {
        let conditionMet = false
        
        switch (condition.operator) {
          case 'equals':
            conditionMet = triggerValue === condition.value
            break
          case 'not_equals':
            conditionMet = triggerValue !== condition.value
            break
          case 'contains':
            conditionMet = String(triggerValue).includes(condition.value)
            break
        }
        
        if (!conditionMet) {
          newVisibleFields.delete(condition.targetFieldId)
        }
      }
    })
    
    setVisibleFields(newVisibleFields)
  }

  const renderField = (field) => {
    if (!visibleFields.has(field.id)) return null

    const value = formData[field.id] || ''

    switch (field.type) {
      case 'singleLineText':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            required={field.required}
          />
        )
      
      case 'multilineText':
        return (
          <textarea
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            required={field.required}
            rows={3}
          />
        )
      
      case 'singleSelect':
        return (
          <select
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            required={field.required}
          >
            <option value="">Select an option</option>
            {field.options?.choices?.map(choice => (
              <option key={choice.id} value={choice.name}>{choice.name}</option>
            ))}
          </select>
        )
      
      case 'multipleSelects':
        return (
          <div>
            {field.options?.choices?.map(choice => (
              <label key={choice.id} style={{ display: 'block', margin: '5px 0' }}>
                <input
                  type="checkbox"
                  checked={(value || []).includes(choice.name)}
                  onChange={(e) => {
                    const currentValues = value || []
                    const newValues = e.target.checked
                      ? [...currentValues, choice.name]
                      : currentValues.filter(v => v !== choice.name)
                    handleFieldChange(field.id, newValues)
                  }}
                />
                {choice.name}
              </label>
            ))}
          </div>
        )
      
      case 'multipleAttachments':
        return (
          <input
            type="file"
            multiple
            onChange={(e) => handleFieldChange(field.id, Array.from(e.target.files))}
            required={field.required}
          />
        )
      
      default:
        return null
    }
  }

  const validateForm = () => {
    const errors = {}
    formConfig.fields.forEach(field => {
      if (field.required && visibleFields.has(field.id)) {
        const value = formData[field.id]
        if (!value || (Array.isArray(value) && value.length === 0)) {
          errors[field.id] = 'This field is required'
        }
      }
    })
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handlePreview = () => {
    if (validateForm()) {
      setShowPreview(true)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateForm()) return
    setIsSubmitting(true)
    
    try {
      // Convert form data to Airtable format
      const airtableFields = {}
      formConfig.fields.forEach(field => {
        if (formData[field.id] !== undefined && formData[field.id] !== '') {
          airtableFields[field.airtableFieldId] = formData[field.id]
        }
      })
      
      const response = await fetch(`${API_BASE}/api/forms/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: airtableFields })
      })
      
      if (response.ok) {
        alert('Form submitted successfully!')
        setFormData({})
      } else {
        throw new Error('Failed to submit form')
      }
    } catch (error) {
      alert('Error submitting form: ' + error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return <div className="container"><div className="card">Loading form...</div></div>
  }

  if (!formConfig) {
    return <div className="container"><div className="card">Form not found</div></div>
  }

  return (
    <div className="container">
      <div className="card">
        <h2>Fill Form</h2>
        <form onSubmit={handleSubmit}>
          {formConfig.fields.map(field => (
            <div key={field.id} className="form-group" style={{ display: visibleFields.has(field.id) ? 'block' : 'none' }}>
              <label>
                {field.label || field.name}
                {field.required && <span style={{ color: 'red' }}> *</span>}
              </label>
              {renderField(field)}
              {validationErrors[field.id] && (
                <div style={{ color: 'red', fontSize: '12px', marginTop: '5px' }}>
                  {validationErrors[field.id]}
                </div>
              )}
            </div>
          ))}
          
          <button 
            type="button" 
            className="btn btn-secondary"
            onClick={handlePreview}
            style={{ marginRight: '10px' }}
          >
            Preview
          </button>
          <PDFExport formConfig={formConfig} formData={formData} visibleFields={visibleFields} />
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={isSubmitting}
            style={{ marginLeft: '10px' }}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Form'}
          </button>
        </form>
      </div>
      
      {showPreview && (
        <div className="card" style={{ marginTop: '20px', backgroundColor: '#f8f9fa' }}>
          <h3>Form Preview</h3>
          <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '4px', backgroundColor: 'white' }}>
            {formConfig.fields.filter(f => visibleFields.has(f.id)).map(field => (
              <div key={field.id} style={{ marginBottom: '10px' }}>
                <strong>{field.label || field.name}:</strong>
                <div style={{ marginLeft: '10px', color: '#666' }}>
                  {Array.isArray(formData[field.id]) 
                    ? formData[field.id].join(', ') 
                    : formData[field.id] || 'Not filled'
                  }
                </div>
              </div>
            ))}
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={() => setShowPreview(false)}
            style={{ marginTop: '10px' }}
          >
            Close Preview
          </button>
        </div>
      )}
    </div>
  )
}

export default FormViewer