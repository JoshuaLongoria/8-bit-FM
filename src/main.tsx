import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// `index.html` contains one empty <div id="root">. This file hands that div to
// React, which draws <App /> inside it and owns everything from there down.
const rootElement = document.getElementById('root')

// getElementById can return null, so check it instead of silencing the type
// with an assertion. If the container is ever missing we want a clear error.
if (!rootElement) {
  throw new Error('Could not find #root in index.html — React has nowhere to mount.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
