const mongoose = require('mongoose');
console.log('MONGO_URI:', process.env.MONGO_URI);
console.log('SECRET_KEY:', process.env.SECRET_KEY);

// mongoose.connect('mongodb://localhost:27017/chat')
//   .then(() => {
//     console.log('Connected to MongoDB');
//     mongoose.connection.close();
//   })
//   .catch(err => {
//     console.error('Failed to connect to MongoDB', err);
//   });
