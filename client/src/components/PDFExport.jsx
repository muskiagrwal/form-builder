import React from 'react'

function PDFExport({ formConfig, formData, visibleFields }) {
  const exportToPDF = () => {
    const printWindow = window.open('', '_blank')
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Form Response</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .field { margin-bottom: 15px; }
          .label { font-weight: bold; margin-bottom: 5px; }
          .value { margin-left: 10px; color: #333; }
        </style>
      </head>
      <body>
        <h1>Form Response</h1>
        <div>
          ${formConfig.fields
            .filter(f => visibleFields.has(f.id))
            .map(field => `
              <div class="field">
                <div class="label">${field.label || field.name}:</div>
                <div class="value">
                  ${Array.isArray(formData[field.id]) 
                    ? formData[field.id].join(', ') 
                    : formData[field.id] || 'Not filled'
                  }
                </div>
              </div>
            `).join('')}
        </div>
        <script>
          window.onload = function() {
            window.print();
            window.close();
          }
        </script>
      </body>
      </html>
    `
    printWindow.document.write(html)
    printWindow.document.close()
  }

  return (
    <button 
      type="button"
      className="btn btn-secondary"
      onClick={exportToPDF}
      style={{ marginLeft: '10px' }}
    >
      Export PDF
    </button>
  )
}

export default PDFExport