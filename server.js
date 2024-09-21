const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const WebSocket = require('ws');
const Alpaca = require('@alpacahq/alpaca-trade-api');

// Alpaca API credentials
const API_KEY = 'PK1QKVHIRD1MM3QTSNU0';
const API_SECRET = '8mnev3rNZc9bEx7H4dJZGN08IdHGI4iBx3ag2S8h';
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

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('subscribeToStock', (symbol) => {
    console.log(`Client subscribed to stock: ${symbol}`);
    streamStockData(symbol, socket);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

function streamStockData(symbol, clientSocket) {
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
    });

    alpacaSocket.on('message', (data) => {
      const parsedData = JSON.parse(data);
        console.log(parsedData);
      if (parsedData && parsedData[0] && parsedData[0].T === 't' && parsedData[0].S === symbol) {
        console.log(`Trade update for ${symbol}: ${JSON.stringify(parsedData)}`);
        clientSocket.emit('stockUpdate', parsedData);
      }
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
