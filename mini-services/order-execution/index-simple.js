const { createServer } = require('http')
const { Server } = require('socket.io')
const { v4: uuidv4 } = require('uuid')

// Configuration
const PORT = 3004

// Create HTTP server
const httpServer = createServer()

// Create Socket.IO server
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Types
const statusOrder = ['PENDING', 'ROUTING', 'BUILDING', 'SUBMITTED', 'CONFIRMED']

// Mock DEX Router
class MockDexRouter {
  constructor() {
    this.basePrice = 0.0001 // SOL/USDC base price
  }
  
  async getRaydiumQuote(tokenIn, tokenOut, amount) {
    await this.sleep(200 + Math.random() * 300)
    const variance = 0.98 + Math.random() * 0.05
    const price = (this.basePrice * variance).toString()
    
    return {
      dex: 'RAYDIUM',
      price,
      fee: 0.003,
      liquidity: '1000000',
      estimatedTime: 2000 + Math.random() * 1000
    }
  }
  
  async getMeteoraQuote(tokenIn, tokenOut, amount) {
    await this.sleep(250 + Math.random() * 350)
    const variance = 0.97 + Math.random() * 0.06
    const price = (this.basePrice * variance).toString()
    
    return {
      dex: 'METEORA',
      price,
      fee: 0.002,
      liquidity: '800000',
      estimatedTime: 1800 + Math.random() * 1200
    }
  }
  
  async executeSwap(dex, order) {
    await this.sleep(2000 + Math.random() * 1000)
    const txHash = this.generateMockTxHash()
    const executedPrice = order.chosenDex === 'RAYDIUM' ? order.raydiumPrice : order.meteoraPrice
    return { txHash, executedPrice: executedPrice || '0' }
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
  
  generateMockTxHash() {
    const chars = '0123456789abcdef'
    let hash = ''
    for (let i = 0; i < 64; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)]
    }
    return hash
  }
}

// Initialize DEX Router
const dexRouter = new MockDexRouter()

// In-memory order storage
const orders = new Map()

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`)
  
  socket.on('subscribe-order', (orderId) => {
    console.log(`Client ${socket.id} subscribed to order ${orderId}`)
    socket.join(`order-${orderId}`)
  })
  
  socket.on('unsubscribe-order', (orderId) => {
    console.log(`Client ${socket.id} unsubscribed from order ${orderId}`)
    socket.leave(`order-${orderId}`)
  })
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
  })
})

// Helper function to broadcast order status
function broadcastOrderStatus(order) {
  io.to(`order-${order.id}`).emit('order-status', {
    orderId: order.id,
    status: order.status,
    chosenDex: order.chosenDex,
    executedPrice: order.executedPrice,
    transactionHash: order.transactionHash,
    errorMessage: order.errorMessage,
    updatedAt: order.updatedAt
  })
}

// Order processing function
async function processOrder(orderId) {
  console.log(`Processing order: ${orderId}`)
  
  const order = orders.get(orderId)
  if (!order) {
    throw new Error(`Order ${orderId} not found`)
  }
  
  try {
    // Step 1: Update status to ROUTING
    order.status = 'ROUTING'
    order.updatedAt = new Date()
    broadcastOrderStatus(order)
    
    // Step 2: Get quotes from both DEXs
    const [raydiumQuote, meteoraQuote] = await Promise.all([
      dexRouter.getRaydiumQuote(order.tokenIn, order.tokenOut, order.amountIn),
      dexRouter.getMeteoraQuote(order.tokenIn, order.tokenOut, order.amountIn)
    ])
    
    // Store quotes for routing decision
    order.raydiumPrice = raydiumQuote.price
    order.meteoraPrice = meteoraQuote.price
    
    // Calculate price difference
    const raydiumPriceNum = parseFloat(raydiumQuote.price)
    const meteoraPriceNum = parseFloat(meteoraQuote.price)
    order.priceDifference = Math.abs(raydiumPriceNum - meteoraPriceNum) / Math.min(raydiumPriceNum, meteoraPriceNum)
    
    // Step 3: Choose best DEX
    order.chosenDex = raydiumPriceNum < meteoraPriceNum ? 'RAYDIUM' : 'METEORA'
    
    console.log(`Order ${orderId}: Chosen DEX: ${order.chosenDex}, Raydium: ${raydiumQuote.price}, Meteora: ${meteoraQuote.price}`)
    
    // Step 4: Update status to BUILDING
    order.status = 'BUILDING'
    order.updatedAt = new Date()
    broadcastOrderStatus(order)
    
    // Step 5: Simulate transaction building
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500))
    
    // Step 6: Update status to SUBMITTED
    order.status = 'SUBMITTED'
    order.updatedAt = new Date()
    broadcastOrderStatus(order)
    
    // Step 7: Execute swap
    const { txHash, executedPrice } = await dexRouter.executeSwap(order.chosenDex, order)
    
    // Step 8: Update order with execution details
    order.executedPrice = executedPrice
    order.transactionHash = txHash
    order.status = 'CONFIRMED'
    order.updatedAt = new Date()
    
    console.log(`Order ${orderId}: Executed successfully, txHash: ${txHash}`)
    
    // Step 9: Broadcast final status
    broadcastOrderStatus(order)
    
    return { success: true, orderId, txHash, executedPrice }
    
  } catch (error) {
    console.error(`Order ${orderId} failed:`, error)
    
    order.retryCount = (order.retryCount || 0) + 1
    if (order.retryCount <= 3) {
      const delay = Math.pow(2, order.retryCount) * 1000
      setTimeout(() => processOrder(orderId), delay)
      order.status = 'PENDING'
      order.errorMessage = `Retry ${order.retryCount}/3: ${error.message || 'Unknown error'}`
    } else {
      order.status = 'FAILED'
      order.errorMessage = `Failed after 3 retries: ${error.message || 'Unknown error'}`
    }
    
    order.updatedAt = new Date()
    broadcastOrderStatus(order)
    
    throw error
  }
}

// Simple HTTP server for API endpoints
const http = require('http')

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }
  
  const url = new URL(req.url, `http://localhost:${PORT}`)
  
  if (req.method === 'POST' && url.pathname === '/api/orders/execute') {
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })
    
    req.on('end', () => {
      try {
        const orderData = JSON.parse(body)
        
        // Validate required fields
        const { tokenIn, tokenOut, amountIn } = orderData
        if (!tokenIn || !tokenOut || !amountIn) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Missing required fields' }))
          return
        }
        
        // Create new order
        const order = {
          id: uuidv4(),
          userId: orderData.userId,
          type: 'MARKET',
          tokenIn: orderData.tokenIn,
          tokenOut: orderData.tokenOut,
          amountIn: orderData.amountIn,
          slippage: orderData.slippage || 0.01,
          status: 'PENDING',
          retryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
        
        // Store order
        orders.set(order.id, order)
        
        // Process order
        processOrder(order.id)
        
        console.log(`Order submitted: ${order.id}`)
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          orderId: order.id,
          status: order.status,
          message: 'Order submitted successfully'
        }))
        
      } catch (error) {
        console.error('Order submission error:', error)
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: false,
          error: error.message || 'Unknown error'
        }))
      }
    })
    
  } else if (req.method === 'GET' && url.pathname === '/api/orders') {
    const orderId = url.searchParams.get('orderId')
    
    if (orderId) {
      const order = orders.get(orderId)
      if (!order) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Order not found' }))
        return
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, order }))
    } else {
      const allOrders = Array.from(orders.values())
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        orders: allOrders.sort((a, b) => b.createdAt - a.createdAt)
      }))
    }
    
  } else if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      ordersProcessed: orders.size
    }))
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, error: 'Not found' }))
  }
})

// Start server
const start = async () => {
  try {
    // Start HTTP server
    httpServer.listen(PORT, () => {
      console.log(`Order execution service running on port ${PORT}`)
      console.log(`WebSocket endpoint: ws://localhost:${PORT}`)
      console.log(`API endpoint: http://localhost:${PORT}`)
    })
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, shutting down gracefully...')
      httpServer.close(() => {
        console.log('Server closed')
        process.exit(0)
      })
    })
    
    process.on('SIGINT', () => {
      console.log('Received SIGINT, shutting down gracefully...')
      httpServer.close(() => {
        console.log('Server closed')
        process.exit(0)
      })
    })
    
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

start()