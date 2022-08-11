import React from 'react'
import ActiveCanvas from './components/ActiveCanvas'
import CanvasManager from './components/CanvasManager'
import Content from './components/Content'
import Selectable from './components/Selectable'



const App = () => {

  return (
    // <CanvasManager />
    <div>
      <ActiveCanvas />
      <Content />
    </div>
    
  )
}

export default App
