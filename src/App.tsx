import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import './App.css';


import ModelViewer from './Pages/ModelViewer2';
import IndividualModelViewer from './Pages/IndividualModelViewer';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ModelViewer />} />
        <Route path="/individual/:variant/:unitId?" element={<IndividualModelViewer />} />
      </Routes>
    </Router>
  );
}

export default App;