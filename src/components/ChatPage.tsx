import React, { useState, useEffect, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import axios from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faImage, faUpload } from '@fortawesome/free-solid-svg-icons';

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
  const [users, setUsers] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [background, setBackground] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [unreadMessages, setUnreadMessages] = useState<{ [key: string]: number }>({});
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [loggedinAS, setLoggedinAS] = useState('');
  const socket = useRef<Socket | null>(null);

  useEffect(() => {
    socket.current = io('http://localhost:3001', {
      auth: { token }
    });

    socket.current.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
    });

    socket.current.on('login message', (message: string) => {
      setLoggedinAS(message);
    });

    socket.current.on('private message', (msg: { from: string; content: string; type: 'text' | 'image'; timestamp: string }) => {
      setMessages((prevMessages) => [...prevMessages, { ...msg, read: false }]);
      if (msg.from === selectedUser) {
        socket.current?.emit('read message', { from: msg.from, to: socket.current?.username });
      } else {
        setUnreadMessages(prev => ({ ...prev, [msg.from]: (prev[msg.from] || 0) + 1 }));
      }
    });

    socket.current.on('typing', ({ from, isTyping }: { from: string; isTyping: boolean }) => {
      setTypingStatus(isTyping ? `${from} is typing...` : '');
    });

    socket.current.on('active users', (activeUsers: string[]) => {
      setUsers(activeUsers);
    });

    socket.current.on('read message', ({ from }: { from: string }) => {
      setMessages((prevMessages) =>
        prevMessages.map((msg) => (msg.from === from ? { ...msg, read: true } : msg))
      );
      setUnreadMessages(prev => ({ ...prev, [from]: 0 }));
    });

    socket.current.emit('get unread messages', (unreadMessages: { [key: string]: number }) => {
      setUnreadMessages(unreadMessages);
    });

    axios.get('http://localhost:3001/users').then(response => {
      setUsers(response.data);
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

  const handleBackgroundUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const formData = new FormData();
      formData.append('image', file);

      try {
        const response = await axios.post('http://localhost:3001/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        setBackground(response.data.imageUrl);
      } catch (error) {
        console.error('Error uploading background:', error);
      }
    }
  };

  return (
    <div className="flex h-screen" style={{ backgroundImage: background ? `url(${background})` : 'none', backgroundSize: 'cover' }}>
      <aside className="w-1/4 bg-gray-200 p-4 overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">You : {loggedinAS}</h2>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 p-2 border rounded-lg w-full"
          placeholder="Search users..."
        />
        <ul>
          {users
            .filter(user => user.includes(search) && user !== socket.current?.username)
            .map((user, index) => (
              <li
                key={index}
                className={`mb-2 p-2 rounded cursor-pointer ${selectedUser === user ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-300'}`}
                onClick={() => setSelectedUser(user)}
              >
                {user} {unreadMessages[user] && <span className="text-red-500">({unreadMessages[user]})</span>}
              </li>
            ))}
        </ul>
      </aside>
      <div className="flex flex-col flex-grow h-full">
        <header className="bg-blue-600 text-white p-4 text-center text-2xl font-bold">
          Real-time Chat
        </header>
        <div className="flex flex-col flex-grow p-4 overflow-auto bg-gray-100">
          <div className="flex flex-col space-y-4 max-w-2xl mx-auto">
            {messages
              .filter((msg) => msg.from === selectedUser || msg.from === 'me')
              .map((msg, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg shadow-md max-w-xs ${msg.from === 'me' ? 'bg-blue-500 text-white self-end' : 'bg-white text-black'}`}
                >
                  {msg.type === 'text' ? msg.content : <img src={msg.content} alt="Uploaded" className="max-w-xs max-h-60" />}
                  <div className="text-sm text-gray-500">{new Date(msg.timestamp).toLocaleTimeString()}</div>
                </div>
              ))}
          </div>
        </div>
        <footer className="p-4 flex items-center">
          <label className="cursor-pointer mr-4">
            <FontAwesomeIcon icon={faImage} className="text-xl text-gray-600 hover:text-blue-500" />
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </label>
          <label className="cursor-pointer mr-4">
            <FontAwesomeIcon icon={faUpload} className="text-xl text-gray-600 hover:text-blue-500" />
            <input
              type="file"
              accept="image/*"
              onChange={handleBackgroundUpload}
              className="hidden"
            />
          </label>
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            className="flex-grow p-2 border rounded-l-lg"
            placeholder="Type a message..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                sendMessage();
              }
            }}
          />
          <button
            onClick={sendMessage}
            className="bg-blue-500 text-white p-2 rounded-r-lg"
          >
            Send
          </button>
        </footer>
        {typingStatus && <p className="text-gray-500 p-4">{typingStatus}</p>}
      </div>
    </div>
  );
};

export default ChatPage;
