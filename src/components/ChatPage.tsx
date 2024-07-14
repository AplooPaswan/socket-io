import React, { useState, useEffect, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import axios from 'axios';

interface ChatPageProps {
  token: string;
}

interface Message {
  from: string;
  type: 'text' | 'image';
  content: string;
  timestamp: string;
  read: boolean;
}

const ChatPage: React.FC<ChatPageProps> = ({ token }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typingStatus, setTypingStatus] = useState('');
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const socket = useRef<Socket | null>(null);

  useEffect(() => {
    socket.current = io('http://localhost:3001', {
      auth: { token }
    });

    socket.current.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
    });

    socket.current.on('private message', (msg: { from: string; content: string; type: 'text' | 'image'; timestamp: string }) => {
      setMessages((prevMessages) => [...prevMessages, { ...msg, read: false }]);
      if (msg.from === selectedUser) {
        socket.current?.emit('read message', { from: msg.from, to: socket.current.username });
      }
    });

    socket.current.on('typing', ({ from, isTyping }: { from: string; isTyping: boolean }) => {
      setTypingStatus(isTyping ? `${from} is typing...` : '');
    });

    socket.current.on('active users', (users: string[]) => {
      setActiveUsers(users.filter(u => u !== socket.current?.auth.token));
    });

    socket.current.on('read message', ({ from }: { from: string }) => {
      setMessages((prevMessages) =>
        prevMessages.map((msg) => (msg.from === from ? { ...msg, read: true } : msg))
      );
    });

    return () => {
      socket.current?.disconnect();
    };
  }, [token, selectedUser]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (selectedUser) {
      socket.current?.emit('typing', { isTyping: e.target.value.length > 0, to: selectedUser });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (selectedUser) {
        socket.current?.emit('typing', { isTyping: false, to: selectedUser });
      }
    }, 1000); // 1 second of inactivity
  };

  const sendMessage = () => {
    if (input.trim() && selectedUser) {
      const timestamp = new Date().toISOString();
      socket.current?.emit('private message', { content: input, to: selectedUser, type: 'text', timestamp });
      setMessages((prevMessages) => [...prevMessages, { from: 'me', type: 'text', content: input, timestamp, read: false }]);
      setInput('');
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      socket.current?.emit('typing', { isTyping: false, to: selectedUser });
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && selectedUser) {
      const formData = new FormData();
      formData.append('image', file);

      try {
        const response = await axios.post('http://localhost:3001/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        const imageUrl = response.data.imageUrl;
        const timestamp = new Date().toISOString();
        socket.current?.emit('private message', { content: imageUrl, to: selectedUser, type: 'image', timestamp });
        setMessages((prevMessages) => [...prevMessages, { from: 'me', type: 'image', content: imageUrl, timestamp, read: false }]);
      } catch (error) {
        console.error('Error uploading image:', error);
      }
    }
  };

  return (
    <div className="flex h-screen">
      <aside className="w-1/4 bg-gray-200 p-4 overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Active Users</h2>
        <ul>
          {activeUsers.map((user, index) => (
            <li
              key={index}
              className={`mb-2 p-2 rounded cursor-pointer ${selectedUser === user ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-300'}`}
              onClick={() => setSelectedUser(user)}
            >
              {user}
            </li>
          ))}
        </ul>
      </aside>
      <div className="flex flex-col flex-grow h-full">
        <header className="bg-blue-600 text-white p-4 text-center text-2xl font-bold">
          Real-time Chat
        </header>
        <div className="flex flex-col flex-grow p-4 overflow-auto bg-gray-100">
          <div className="flex flex-col space-y-4">
            {messages
              .filter((msg) => msg.from === selectedUser || msg.from === 'me')
              .map((msg, index) => (
                <div key={index} className={`flex ${msg.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                  {msg.type === 'text' ? (
                    <div className={`bg-white rounded-lg p-4 shadow-md ${msg.from === 'me' ? 'bg-blue-100' : ''}`}>
                      <p className="text-xs text-gray-500">{msg.from}</p>
                      {msg.content}
                      <p className="text-xs text-gray-400 mt-2">{new Date(msg.timestamp).toLocaleTimeString()} {msg.read && '✓✓'}</p>
                    </div>
                  ) : (
                    <div className={`bg-white rounded-lg p-4 shadow-md ${msg.from === 'me' ? 'bg-blue-100' : ''}`}>
                      <p className="text-xs text-gray-500">{msg.from}</p>
                      <img src={msg.content} alt="shared" className="max-w-xs max-h-64 rounded-lg" />
                      <p className="text-xs text-gray-400 mt-2">{new Date(msg.timestamp).toLocaleTimeString()} {msg.read && '✓✓'}</p>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
        <div className="p-4 bg-white border-t border-gray-300">
          <div className="flex items-center">
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              className="border p-2 flex-grow mr-2 rounded-lg shadow-sm"
              placeholder="Type a message..."
            />
            <button
              onClick={sendMessage}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-md mr-2"
            >
              Send
            </button>
            <input
              type="file"
              onChange={handleImageUpload}
              className="hidden"
              id="imageUpload"
            />
            <label htmlFor="imageUpload" className="bg-green-500 text-white px-4 py-2 rounded-lg shadow-md cursor-pointer">
              Upload Image
            </label>
          </div>
          {typingStatus && (
            <div className="mt-2 text-gray-500">
              {typingStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
