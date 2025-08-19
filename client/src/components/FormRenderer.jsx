import React, { useState } from 'react'

const API_BASE = 'http://localhost:3001'

function FormRenderer({ formConfig }) {
  const [formData, setFormData] = useState({})
  const [visibleFields, setVisibleFields] = useState(new Set(formConfig?.fields.map(f => f.id) || []))
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!formConfig) {
    return <div className="card">No form configuration available</div>
  }

  const handleFieldChange = (fieldId, value) => {
    const newFormData = { ...formData, [fieldId]: value }
    setFormData(newFormData)
    
    // Apply conditional logic
    const newVisibleFields = new Set(formConfig.fields.map(f => f.id))
    
    formConfig.conditions.forEach(condition => {
      const triggerField = formConfig.fields.find(f => f.id === condition.fieldId)
      const triggerValue = newFormData[condition.fieldId]
      
      if (triggerField && triggerValue !== undefined) {
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
        
        if (conditionMet && condition.action === 'hide') {
          newVisibleFields.delete(condition.targetFieldId)
        } else if (!conditionMet && condition.action === 'show') {
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    try {
      // Convert form data to Airtable format
      const airtableFields = {}
      formConfig.fields.forEach(field => {
        if (formData[field.id] !== undefined && formData[field.id] !== '') {
          airtableFields[field.airtableFieldId] = formData[field.id]
        }
      })
      
      const response = await fetch(
        `${API_BASE}/api/bases/${formConfig.baseId}/tables/${formConfig.tableId}/records`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ fields: airtableFields })
        }
      )
      
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

  return (
    <div className="card">
      <h3>Form Preview</h3>
      <form onSubmit={handleSubmit}>
        {formConfig.fields.map(field => (
          <div key={field.id} className="form-group" style={{ display: visibleFields.has(field.id) ? 'block' : 'none' }}>
            <label>
              {field.label || field.name}
              {field.required && <span style={{ color: 'red' }}> *</span>}
            </label>
            {renderField(field)}
          </div>
        ))}
        
        <button 
          type="submit" 
          className="btn btn-primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Form'}
        </button>
      </form>
    </div>
  )
}

export default FormRenderer