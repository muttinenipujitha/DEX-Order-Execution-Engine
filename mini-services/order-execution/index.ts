import { createServer } from 'http'
import { Server } from 'socket.io'
import { v4 as uuidv4 } from 'uuid'

const PORT = 3004

// Create HTTP server
const httpServer = createServer()

// Create Socket.IO server
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
})

// Mock DEX Router
class MockDexRouter {
  private basePrice = 0.0001
  
  async getRaydiumQuote() {
    await this.sleep(200)
    const variance = 0.98 + Math.random() * 0.05
    return {
      dex: 'RAYDIUM',
      price: (this.basePrice * variance).toString(),
      fee: 0.003
    }
  }
  
  async getMeteoraQuote() {
    await this.sleep(250)
    const variance = 0.97 + Math.random() * 0.06
    return {
      dex: 'METEORA',
      price: (this.basePrice * variance).toString(),
      fee: 0.002
    }
  }
  
  async executeSwap(dex: string) {
    await this.sleep(2000 + Math.random() * 1000)
    const chars = '0123456789abcdef'
    let hash = ''
    for (let i = 0; i < 64; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)]
    }
    return { txHash: hash, executedPrice: this.basePrice.toString() }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

const dexRouter = new MockDexRouter()
const orders = new Map()

// WebSocket handling
io.on('connection', (socket) => {
  console.log(`🔗 Client connected: ${socket.id}`)
  
  socket.on('subscribe-order', (orderId: string) => {
    console.log(`👂 Client ${socket.id} subscribed to order ${orderId}`)
    socket.join(`order-${orderId}`)
  })
  
  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`)
  })
})

function broadcastOrderStatus(order: any) {
  io.to(`order-${order.id}`).emit('order-status', {
    orderId: order.id,
    status: order.status,
    chosenDex: order.chosenDex,
    executedPrice: order.executedPrice,
    transactionHash: order.transactionHash,
    updatedAt: order.updatedAt
  })
}

async function processOrder(orderId: string) {
  console.log(`🔄 Processing order: ${orderId}`)
  
  const order = orders.get(orderId)
  if (!order) {
    throw new Error(`Order ${orderId} not found`)
  }
  
  try {
    // Step 1: ROUTING
    order.status = 'ROUTING'
    order.updatedAt = new Date()
    broadcastOrderStatus(order)
    
    // Step 2: Get quotes
    const [raydiumQuote, meteoraQuote] = await Promise.all([
      dexRouter.getRaydiumQuote(),
      dexRouter.getMeteoraQuote()
    ])
    
    order.raydiumPrice = raydiumQuote.price
    order.meteoraPrice = meteoraQuote.price
    
    const raydiumPriceNum = parseFloat(raydiumQuote.price)
    const meteoraPriceNum = parseFloat(meteoraQuote.price)
    order.chosenDex = raydiumPriceNum < meteoraPriceNum ? 'RAYDIUM' : 'METEORA'
    
    console.log(`📊 Order ${orderId}: Chosen ${order.chosenDex} - Raydium: ${raydiumQuote.price}, Meteora: ${meteoraQuote.price}`)
    
    // Step 3: BUILDING
    order.status = 'BUILDING'
    order.updatedAt = new Date()
    broadcastOrderStatus(order)
    
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Step 4: SUBMITTED
    order.status = 'SUBMITTED'
    order.updatedAt = new Date()
    broadcastOrderStatus(order)
    
    // Step 5: EXECUTE
    const { txHash, executedPrice } = await dexRouter.executeSwap(order.chosenDex)
    
    order.executedPrice = executedPrice
    order.transactionHash = txHash
    order.status = 'CONFIRMED'
    order.updatedAt = new Date()
    
    console.log(`✅ Order ${orderId}: Executed successfully - txHash: ${txHash}`)
    broadcastOrderStatus(order)
    
    return { success: true, orderId, txHash, executedPrice }
    
  } catch (error) {
    console.error(`❌ Order ${orderId} failed:`, error)
    order.status = 'FAILED'
    order.errorMessage = error instanceof Error ? error.message : 'Unknown error'
    order.updatedAt = new Date()
    broadcastOrderStatus(order)
    throw error
  }
}

// HTTP Server
httpServer.on('request', (req: any, res: any) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }
  
  if (req.method === 'POST' && url.pathname === '/api/orders/execute') {
    let body = ''
    req.on('data', (chunk: any) => {
      body += chunk.toString()
    })
    
    req.on('end', () => {
      try {
        const orderData = JSON.parse(body)
        const { tokenIn, tokenOut, amountIn } = orderData
        
        if (!tokenIn || !tokenOut || !amountIn) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Missing required fields' }))
          return
        }
        
        const order = {
          id: uuidv4(),
          tokenIn,
          tokenOut,
          amountIn,
          slippage: orderData.slippage || 0.01,
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date()
        }
        
        orders.set(order.id, order)
        processOrder(order.id)
        
        console.log(`📝 Order submitted: ${order.id}`)
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          orderId: order.id,
          status: order.status,
          message: 'Order submitted successfully'
        }))
        
      } catch (error) {
        console.error('❌ Order submission error:', error)
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
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
        orders: allOrders.sort((a: any, b: any) => b.createdAt - a.createdAt)
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
httpServer.listen(PORT, () => {
  console.log(`🚀 Order execution service running on port ${PORT}`)
  console.log(`📡 WebSocket: ws://localhost:${PORT}`)
  console.log(`🌐 API: http://localhost:${PORT}`)
  console.log(`💚 Health: http://localhost:${PORT}/health`)
  console.log(`📊 Orders: http://localhost:${PORT}/api/orders`)
})