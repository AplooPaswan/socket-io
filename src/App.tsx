import React, { useState, useEffect } from 'react';
import ChatPage from './components/ChatPage';
import LoginPage from './components/LoginPage';

const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }, [token]);

  return token ? <ChatPage token={token} /> : <LoginPage setToken={setToken} />;
};

export default App;
