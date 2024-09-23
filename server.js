const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const WebSocket = require('ws');
const Alpaca = require('@alpacahq/alpaca-trade-api');

// Alpaca API credentials
const API_KEY = 'PKNW882FKKJQKBITVJ8D';
const API_SECRET = 'TczzaBOZe8ChtSzjwErasaa1GU1lcKstMigbaBif';
const PAPER_TRADING = true;

const alpaca = new Alpaca({
  keyId: API_KEY,
  secretKey: API_SECRET,
  paper: PAPER_TRADING,
  usePolygon: false
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let alpacaSocket;  // Maintain a single WebSocket connection
let clients = [];  // Array to store connected clients

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('New client connected');
  
  // Add the new client to the clients array
  clients.push(socket);

  socket.on('subscribeToStock', (symbol) => {
    console.log(`Client subscribed to stock: ${symbol}`);
    streamStockData(symbol);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    
    // Remove the disconnected client from the clients array
    clients = clients.filter(client => client !== socket);
  });
});

function streamStockData(symbol) {
  const alpacaWsUrl = 'wss://stream.data.alpaca.markets/v2/iex';

  if (!alpacaSocket) {
    alpacaSocket = new WebSocket(alpacaWsUrl);

    alpacaSocket.on('open', () => {
      console.log('Connected to Alpaca WebSocket');

      const authMessage = {
        action: 'auth',
        key: API_KEY,
        secret: API_SECRET
      };

      alpacaSocket.send(JSON.stringify(authMessage));

      const subscribeMessage = {
        action: 'subscribe',
        trades: [symbol]
      };

      alpacaSocket.send(JSON.stringify(subscribeMessage));
    });

    alpacaSocket.on('message', (data) => {
      const parsedData = JSON.parse(data);

      // Emit the data to all connected clients
      clients.forEach(clientSocket => {
        clientSocket.emit('stockUpdate', parsedData);
      });
    });

    alpacaSocket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    alpacaSocket.on('close', () => {
      console.log('Disconnected from Alpaca WebSocket');
      alpacaSocket = null;
    });
  } else {
    const subscribeMessage = {
      action: 'subscribe',
      trades: [symbol]
    };
    alpacaSocket.send(JSON.stringify(subscribeMessage));
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
