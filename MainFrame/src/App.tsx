import { HashRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import InputStudio from "./pages/InputStudio";
import MatrixStudio from "./pages/MatrixStudio";
import SystemHealth from "./pages/SystemHealth";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="input" element={<InputStudio />} />
          <Route path="matrix" element={<MatrixStudio />} />
          <Route path="system" element={<SystemHealth />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
