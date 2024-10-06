const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const WebSocket = require('ws');
const Alpaca = require('@alpacahq/alpaca-trade-api');


require('dotenv').config();

// Alpaca API credentials from environment variables
const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const PAPER_TRADING = process.env.PAPER_TRADING === 'true'; // Convert string to boolean


const alpaca = new Alpaca({
  keyId: API_KEY,
  secretKey: API_SECRET,
  paper: PAPER_TRADING,
  usePolygon: false
});

const app = express();
const server = http.createServer(app);
app.use(cors());

const io = socketIo(server, {
  cors: {
    origin: "*", // Allow all origins
    methods: ["GET", "POST"],
    credentials: true
  }
});

let alpacaSocket;
let clients = [];
let lastMarketStatus = 'closed'; // To track the last market status

app.use(express.static('public'));


function isStockMarketOpen() {
  const now = new Date();
  const day = now.getDay(); // Get the current day (0 is Sunday, 6 is Saturday)
  const hours = now.getHours();
  const minutes = now.getMinutes();

  // Stock market is open from Monday to Friday, 9:30 AM to 4:00 PM
  const marketOpenTime = { hour: 9, minute: 30 };
  const marketCloseTime = { hour: 16, minute: 0 };

  const isWeekend = day === 0 || day === 6; // Sunday or Saturday
  const isBeforeOpen = hours < marketOpenTime.hour || (hours === marketOpenTime.hour && minutes < marketOpenTime.minute);
  const isAfterClose = hours > marketCloseTime.hour || (hours === marketCloseTime.hour && minutes >= marketCloseTime.minute);

  if (isWeekend || isBeforeOpen || isAfterClose) {
    return 'closed'; 
  } else {
    return 'open';
  }
}

setInterval(() => {
  const currentMarketStatus = isStockMarketOpen();
  console.log('Checking market status...');

  if (lastMarketStatus === 'closed' && currentMarketStatus === 'open') {
    console.log('Market just opened!');

    io.emit('marketStatusUpdate', { status: 'open', message: 'The stock market is now open!' });
  }
  
  lastMarketStatus = currentMarketStatus;
}, 60000);


io.on('connection', (socket) => {
  console.log('New client connected');
  
  const marketStatus = isStockMarketOpen();
  socket.emit('marketStatusUpdate', { status: marketStatus, message: `The stock market is currently ${marketStatus}.` });

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
