import React, { useState, useEffect } from 'react'

const API_BASE = 'http://localhost:3001'

function FormBuilder({ bases, onFormSave }) {
  const [selectedBase, setSelectedBase] = useState('')
  const [tables, setTables] = useState([])
  const [selectedTable, setSelectedTable] = useState('')
  const [fields, setFields] = useState([])
  const [formFields, setFormFields] = useState([])
  const [conditions, setConditions] = useState([])

  const fetchTables = async (baseId) => {
    try {
      const response = await fetch(`${API_BASE}/api/bases/${baseId}/schema`, { credentials: 'include' })
      const data = await response.json()
      setTables(data)
    } catch (error) {
      console.error('Failed to fetch tables:', error)
    }
  }

  const handleBaseChange = (baseId) => {
    setSelectedBase(baseId)
    setSelectedTable('')
    setFields([])
    if (baseId) fetchTables(baseId)
  }

  const handleTableChange = (tableId) => {
    setSelectedTable(tableId)
    const table = tables.find(t => t.id === tableId)
    const supportedTypes = ['singleLineText', 'multilineText', 'singleSelect', 'multipleSelects', 'multipleAttachments']
    setFields(table ? table.fields.filter(f => supportedTypes.includes(f.type)) : [])
  }

  const addFormField = (field) => {
    const formField = {
      id: Date.now(),
      airtableFieldId: field.id,
      name: field.name,
      label: field.name,
      type: field.type,
      required: false,
      options: field.options
    }
    setFormFields([...formFields, formField])
  }

  const updateFormField = (id, updates) => {
    setFormFields(formFields.map(f => f.id === id ? { ...f, ...updates } : f))
  }

  const removeFormField = (id) => {
    setFormFields(formFields.filter(f => f.id !== id))
  }

  const addCondition = () => {
    setConditions([...conditions, {
      id: Date.now(),
      fieldId: '',
      operator: 'equals',
      value: '',
      action: 'show',
      targetFieldId: ''
    }])
  }

  const updateCondition = (id, updates) => {
    setConditions(conditions.map(c => c.id === id ? { ...c, ...updates } : c))
  }

  const removeCondition = (id) => {
    setConditions(conditions.filter(c => c.id !== id))
  }

  const saveForm = () => {
    const config = {
      baseId: selectedBase,
      tableId: selectedTable,
      fields: formFields,
      conditions
    }
    onFormSave(config)
  }

  return (
    <div>
      <div className="card">
        <h3>Select Airtable Base & Table</h3>
        <div className="form-group">
          <label>Base:</label>
          <select value={selectedBase} onChange={(e) => handleBaseChange(e.target.value)}>
            <option value="">Select a base</option>
            {bases.map(base => (
              <option key={base.id} value={base.id}>{base.name}</option>
            ))}
          </select>
        </div>
        
        {tables.length > 0 && (
          <div className="form-group">
            <label>Table:</label>
            <select value={selectedTable} onChange={(e) => handleTableChange(e.target.value)}>
              <option value="">Select a table</option>
              {tables.map(table => (
                <option key={table.id} value={table.id}>{table.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {fields.length > 0 && (
        <div className="card">
          <h3>Available Fields</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
            {fields.map(field => (
              <div key={field.id} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}>
                <strong>{field.name}</strong>
                <div style={{ fontSize: '12px', color: '#666' }}>{field.type}</div>
                <button 
                  className="btn btn-primary" 
                  style={{ marginTop: '5px', fontSize: '12px' }}
                  onClick={() => addFormField(field)}
                >
                  Add to Form
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {formFields.length > 0 && (
        <div className="card">
          <h3>Form Fields</h3>
          {formFields.map(field => (
            <div key={field.id} className="field-builder">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{field.name} ({field.type})</strong>
                <button className="btn btn-secondary" onClick={() => removeFormField(field.id)}>Remove</button>
              </div>
              
              <div className="form-group">
                <label>Question Label:</label>
                <input 
                  type="text"
                  value={field.label}
                  onChange={(e) => updateFormField(field.id, { label: e.target.value })}
                  placeholder="Enter custom label"
                />
              </div>
              
              <label>
                <input 
                  type="checkbox" 
                  checked={field.required}
                  onChange={(e) => updateFormField(field.id, { required: e.target.checked })}
                />
                Required
              </label>
            </div>
          ))}
        </div>
      )}

      {formFields.length > 0 && (
        <div className="card">
          <h3>Conditional Logic</h3>
          <button className="btn btn-primary" onClick={addCondition}>Add Condition</button>
          {conditions.map(condition => (
            <div key={condition.id} className="condition">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '10px', alignItems: 'center' }}>
                <select 
                  value={condition.fieldId}
                  onChange={(e) => updateCondition(condition.id, { fieldId: e.target.value })}
                >
                  <option value="">Select field</option>
                  {formFields.map(field => (
                    <option key={field.id} value={field.id}>{field.name}</option>
                  ))}
                </select>
                
                <select 
                  value={condition.operator}
                  onChange={(e) => updateCondition(condition.id, { operator: e.target.value })}
                >
                  <option value="equals">Equals</option>
                  <option value="not_equals">Not Equals</option>
                  <option value="contains">Contains</option>
                </select>
                
                <input 
                  type="text"
                  placeholder="Value"
                  value={condition.value}
                  onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                />
                
                <select 
                  value={condition.targetFieldId}
                  onChange={(e) => updateCondition(condition.id, { targetFieldId: e.target.value })}
                >
                  <option value="">Then show/hide field</option>
                  {formFields.map(field => (
                    <option key={field.id} value={field.id}>{field.label}</option>
                  ))}
                </select>
                
                <button className="btn btn-secondary" onClick={() => removeCondition(condition.id)}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formFields.length > 0 && (
        <div className="card">
          <button className="btn btn-primary" onClick={saveForm}>Save Form Configuration</button>
        </div>
      )}
    </div>
  )
}

export default FormBuilder