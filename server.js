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

let alpacaSocket;
let clients = [];

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('New client connected');
  
  clients.push(socket);

  // Handle subscription to multiple stocks
  socket.on('subscribeToStocks', (symbols) => {
    console.log(`Client subscribed to stocks: ${symbols}`);
    
    // Subscribe to each stock in the array
    symbols.forEach(symbol => {
      streamStockData(symbol);
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
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

      // Authenticate with Alpaca WebSocket
      alpacaSocket.send(JSON.stringify(authMessage));

      // After authenticating, subscribe to the stock symbol
      const subscribeMessage = {
        action: 'subscribe',
        trades: [symbol]
      };

      alpacaSocket.send(JSON.stringify(subscribeMessage));
    });

    alpacaSocket.on('message', (data) => {
      const parsedData = JSON.parse(data);
      console.log(parsedData);
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
  } else if (alpacaSocket.readyState === WebSocket.OPEN) {
    // If the WebSocket is already open, send the subscribe message immediately
    const subscribeMessage = {
      action: 'subscribe',
      trades: [symbol]
    };
    alpacaSocket.send(JSON.stringify(subscribeMessage));
  } else {
    // Handle cases where WebSocket is not ready or is closing
    console.error('WebSocket is not open or is in the process of connecting/closing.');
  }
}


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
